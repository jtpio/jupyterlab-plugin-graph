import { JupyterLab } from '@jupyterlab/application';

import { ISignal, Signal } from '@lumino/signaling';

/**
 * The kind of a node: a plugin that provides a service, a plugin that
 * provides none, or a service that no plugin provides.
 */
export type NodeKind = 'service' | 'plugin' | 'token';

/**
 * The layout of the graph.
 */
export type Layout = 'force' | 'circular';

/**
 * A node of the plugin graph.
 */
export interface INode {
  /**
   * The plugin id, or the token name for a service without plugin.
   */
  id: string;
  kind: NodeKind;
  description: string;
  /**
   * The name of the provided token, or an empty string.
   */
  provides: string;
  /**
   * The number of plugins that use this node.
   */
  dependents: number;
  /**
   * The number of services that this node uses.
   */
  dependencies: number;
  /**
   * Whether the node matches a non-empty filter.
   */
  matched: boolean;
}

/**
 * An edge from a plugin to a service that it uses.
 */
export interface IEdge {
  source: string;
  target: string;
  optional: boolean;
}

/**
 * The plugin graph.
 */
export interface IGraph {
  nodes: INode[];
  edges: IEdge[];
}

/**
 * The model of the plugin graph.
 */
export class Model {
  constructor(options: Model.IOptions) {
    // The order of the plugins changes between page loads. A sort makes
    // the layouts stable.
    this._plugins = options.plugins
      .filter(plugin => plugin.enabled)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * The graph for the current filter and edge types.
   */
  get graph(): IGraph {
    if (!this._graph) {
      this._graph = this._buildGraph();
    }
    return this._graph;
  }

  /**
   * The text that the nodes must contain. The graph keeps the matching
   * nodes and their direct neighbors.
   */
  get filter(): string {
    return this._state.filter;
  }
  set filter(filter: string) {
    this._update('filter', filter);
  }

  /**
   * Whether to show the required dependencies.
   */
  get requires(): boolean {
    return this._state.requires;
  }
  set requires(requires: boolean) {
    this._update('requires', requires);
  }

  /**
   * Whether to show the optional dependencies.
   */
  get optional(): boolean {
    return this._state.optional;
  }
  set optional(optional: boolean) {
    this._update('optional', optional);
  }

  get layout(): Layout {
    return this._state.layout;
  }
  set layout(layout: Layout) {
    this._update('layout', layout);
  }

  /**
   * A signal emitted when the graph or the layout changes.
   */
  get changed(): ISignal<Model, void> {
    return this._changed;
  }

  private _update<K extends keyof Model.IState>(
    key: K,
    value: Model.IState[K]
  ): void {
    if (this._state[key] === value) {
      return;
    }
    this._state[key] = value;
    // The layout does not change the graph. The same graph object lets the
    // widget use the positions that it computed before.
    if (key !== 'layout') {
      this._graph = null;
    }
    this._changed.emit();
  }

  private _buildGraph(): IGraph {
    const providers = new Map<string, string>();
    const nodes = new Map<string, INode>();
    for (const plugin of this._plugins) {
      const provides = plugin.provides?.name ?? '';
      if (provides) {
        providers.set(provides, plugin.id);
      }
      nodes.set(plugin.id, {
        id: plugin.id,
        kind: provides ? 'service' : 'plugin',
        description: plugin.description ?? '',
        provides,
        dependents: 0,
        dependencies: 0,
        matched: false
      });
    }

    const edges: IEdge[] = [];
    const connect = (
      plugin: JupyterLab.IPluginInfo,
      tokens: JupyterLab.IToken[],
      optional: boolean
    ): void => {
      for (const token of tokens) {
        const target = providers.get(token.name) ?? token.name;
        if (!nodes.has(target)) {
          nodes.set(target, {
            id: target,
            kind: 'token',
            description: token.description ?? '',
            provides: token.name,
            dependents: 0,
            dependencies: 0,
            matched: false
          });
        }
        nodes.get(target)!.dependents++;
        nodes.get(plugin.id)!.dependencies++;
        edges.push({ source: plugin.id, target, optional });
      }
    };
    for (const plugin of this._plugins) {
      if (this._state.requires) {
        connect(plugin, plugin.requires, false);
      }
      if (this._state.optional) {
        connect(plugin, plugin.optional, true);
      }
    }

    const query = this._state.filter.trim().toLowerCase();
    if (!query) {
      return { nodes: [...nodes.values()], edges };
    }
    const visible = new Set<string>();
    for (const node of nodes.values()) {
      node.matched =
        node.id.toLowerCase().includes(query) ||
        node.provides.toLowerCase().includes(query);
      if (node.matched) {
        visible.add(node.id);
      }
    }
    const kept = edges.filter(
      edge => nodes.get(edge.source)!.matched || nodes.get(edge.target)!.matched
    );
    for (const edge of kept) {
      visible.add(edge.source);
      visible.add(edge.target);
    }
    return {
      nodes: [...nodes.values()].filter(node => visible.has(node.id)),
      edges: kept
    };
  }

  private _plugins: JupyterLab.IPluginInfo[];
  private _graph: IGraph | null = null;
  private _state: Model.IState = {
    filter: '',
    requires: true,
    optional: true,
    layout: 'force'
  };
  private _changed = new Signal<this, void>(this);
}

/**
 * A namespace for the `Model` statics.
 */
export namespace Model {
  /**
   * The options to create a `Model`.
   */
  export interface IOptions {
    /**
     * The plugins available in the application.
     */
    plugins: JupyterLab.IPluginInfo[];
  }

  /**
   * The state that the user can change.
   */
  export interface IState {
    filter: string;
    requires: boolean;
    optional: boolean;
    layout: Layout;
  }
}
