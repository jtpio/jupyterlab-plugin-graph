import { IThemeManager, MainAreaWidget } from '@jupyterlab/apputils';

import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';

import {
  HTMLSelect,
  InputGroup,
  ReactWidget,
  Toolbar,
  ToolbarButton,
  UseSignal
} from '@jupyterlab/ui-components';

import { Widget } from '@lumino/widgets';

import { GraphChart, GraphSeriesOption } from 'echarts/charts';

import {
  LegendComponent,
  LegendComponentOption,
  TooltipComponent,
  TooltipComponentOption
} from 'echarts/components';

import * as echarts from 'echarts/core';

import { LabelLayout } from 'echarts/features';

import { CanvasRenderer } from 'echarts/renderers';

import React from 'react';

import { zoomInIcon, zoomOutIcon } from './icons';

import { ForceLayout } from './layout';

import { IEdge, INode, Layout, Model, NodeKind } from './model';

echarts.use([
  GraphChart,
  LegendComponent,
  TooltipComponent,
  LabelLayout,
  CanvasRenderer
]);

type Option = echarts.ComposeOption<
  GraphSeriesOption | LegendComponentOption | TooltipComponentOption
>;

/**
 * The node kinds in legend order, with their colors for the light and
 * dark themes. The three colors stay distinct with a color vision deficiency.
 */
const KINDS: { kind: NodeKind; light: string; dark: string }[] = [
  { kind: 'service', light: '#2a78d6', dark: '#3987e5' },
  { kind: 'plugin', light: '#eb6834', dark: '#d95926' },
  { kind: 'token', light: '#1baf7a', dark: '#199e70' }
];

/**
 * The space to keep free around the nodes, for the labels and the legend.
 */
const MARGINS: { [layout in Layout]: number[] } = {
  force: [24, 190, 56, 24],
  circular: [200, 200, 200, 200]
};

/**
 * The zoom factor of the zoom buttons.
 */
const ZOOM_STEP = 1.3;

/**
 * A widget that draws the plugin graph with ECharts.
 */
class Graph extends Widget {
  constructor(options: Graph.IOptions) {
    super();
    this.addClass('jp-PluginGraph');
    this._model = options.model;
    this._trans = options.trans;
    this._model.changed.connect(this.update, this);
    options.themeManager?.themeChanged.connect(this.update, this);
  }

  dispose(): void {
    this._chart?.dispose();
    this._chart = null;
    this._forceLayout.dispose();
    super.dispose();
  }

  /**
   * Zoom the graph by a factor, from the center of the view.
   */
  zoom(factor: number): void {
    this._chart?.dispatchAction({
      type: 'graphRoam',
      seriesIndex: 0,
      zoom: factor,
      originX: this.node.clientWidth / 2,
      originY: this.node.clientHeight / 2
    });
  }

  protected onResize(): void {
    if (this._chart) {
      this._chart.resize();
      return;
    }
    // ECharts cannot initialize in a container that has no size.
    if (this.node.clientWidth === 0 || this.node.clientHeight === 0) {
      return;
    }
    this._chart = echarts.init(this.node);
    this._chart.on('click', params => {
      if (params.dataType === 'node') {
        this._model.filter = params.name;
      }
    });
    // ECharts hides the labels that overlap at the start of a transition.
    // A zoom action computes the label layout again at the end.
    this._chart.on('finished', () => {
      if (this._labelsStale) {
        this._labelsStale = false;
        this.zoom(1);
      }
    });
    this.update();
  }

  protected onUpdateRequest(): void {
    if (!this._chart) {
      return;
    }
    const trans = this._trans;
    const { graph, layout } = this._model;
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    const circular = layout === 'circular';
    const positions = circular ? null : this._forceLayout.compute(graph);
    const [top, right, bottom, left] = MARGINS[layout];
    // The circular layout has less space for each node.
    const size = circular ? 0.6 : 1;

    const style = getComputedStyle(this.node);
    const css = (name: string): string => style.getPropertyValue(name).trim();
    const isLight = document.body.dataset.jpThemeLight !== 'false';
    const surface = css('--jp-layout-color1');
    const ink = css('--jp-ui-font-color1');
    const names: { [kind in NodeKind]: string } = {
      service: trans.__('Plugin with service'),
      plugin: trans.__('Plugin without service'),
      token: trans.__('Service without plugin')
    };
    const symbol = (kind: NodeKind): string =>
      kind === 'token' ? 'diamond' : 'circle';

    const option: Option = {
      textStyle: { fontFamily: css('--jp-ui-font-family') },
      tooltip: {
        className: 'jp-PluginGraph-tooltip',
        confine: true,
        backgroundColor: css('--jp-layout-color0'),
        borderColor: css('--jp-border-color1'),
        formatter: params => {
          const { dataType, data, name } = Array.isArray(params)
            ? params[0]
            : params;
          return dataType === 'edge'
            ? Private.edgeTooltip(trans, data as unknown as IEdge)
            : Private.nodeTooltip(trans, nodes.get(name)!);
        }
      },
      legend: {
        data: KINDS.map(({ kind }) => ({
          name: names[kind],
          icon: symbol(kind)
        })),
        left: 12,
        bottom: 8,
        itemGap: 16,
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { color: css('--jp-ui-font-color2') },
        inactiveColor: css('--jp-ui-font-color3'),
        backgroundColor: surface,
        borderRadius: 4
      },
      series: [
        {
          type: 'graph',
          layout: circular ? 'circular' : 'none',
          top,
          right,
          bottom,
          left,
          preserveAspect: true,
          roam: true,
          // By default, only the bounds of the nodes react to pan and zoom.
          roamTrigger: 'global',
          zoom: 1,
          center: undefined,
          draggable: !circular,
          scaleLimit: { min: 0.2, max: 10 },
          categories: KINDS.map(({ kind, light, dark }) => ({
            name: names[kind],
            symbol: symbol(kind),
            itemStyle: { color: isLight ? light : dark }
          })),
          data: graph.nodes.map(node => ({
            id: node.id,
            name: node.id,
            x: positions?.get(node.id)?.[0],
            y: positions?.get(node.id)?.[1],
            category: KINDS.findIndex(({ kind }) => kind === node.kind),
            symbolSize: size * (8 + 3 * Math.sqrt(node.dependents)),
            label: node.matched ? { fontWeight: 'bold' } : undefined
          })),
          links: graph.edges.map(({ source, target, optional }) => ({
            source,
            target,
            optional,
            lineStyle: optional ? { type: 'dashed' } : undefined
          })),
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: 5,
          itemStyle: { borderColor: surface, borderWidth: 1 },
          lineStyle: {
            color: ink,
            opacity: 0.18,
            curveness: circular ? 0.3 : 0
          },
          label: {
            show: true,
            position: 'right',
            color: ink,
            fontSize: 11,
            formatter: ({ name }) => Private.shortName(name)
          },
          labelLayout: { hideOverlap: true },
          emphasis: {
            focus: 'adjacency',
            lineStyle: { width: 2, opacity: 0.8 }
          },
          blur: {
            itemStyle: { opacity: 0.15 },
            lineStyle: { opacity: 0.04 },
            label: { opacity: 0.15 }
          },
          circular: { rotateLabel: true }
        }
      ]
    };
    this._chart.setOption(option);
    this._labelsStale = true;
  }

  private _model: Model;
  private _trans: TranslationBundle;
  private _chart: echarts.ECharts | null = null;
  private _forceLayout = new ForceLayout();
  private _labelsStale = false;
}

/**
 * A namespace for the `Graph` statics.
 */
namespace Graph {
  /**
   * The options to create a `Graph`.
   */
  export interface IOptions {
    model: Model;
    trans: TranslationBundle;
    /**
     * The theme manager, to draw the graph again when the theme changes.
     */
    themeManager?: IThemeManager | null;
  }
}

/**
 * The properties of the toolbar components.
 */
interface IToolbarProps {
  model: Model;
  trans: TranslationBundle;
}

/**
 * The filter input of the toolbar.
 */
const Filter = ({ model, trans }: IToolbarProps): JSX.Element => (
  <UseSignal signal={model.changed}>
    {() => (
      <InputGroup
        className="jp-PluginGraph-filter"
        type="search"
        placeholder={trans.__('Filter plugins')}
        aria-label={trans.__('Filter plugins')}
        rightIcon="ui-components:search"
        value={model.filter}
        onChange={event => {
          model.filter = event.target.value;
        }}
      />
    )}
  </UseSignal>
);

/**
 * A checkbox that shows or hides one type of dependency.
 */
const Toggle = (
  props: IToolbarProps & { type: 'requires' | 'optional' }
): JSX.Element => {
  const { model, trans, type } = props;
  return (
    <UseSignal signal={model.changed}>
      {() => (
        <label className="jp-PluginGraph-toggle">
          <input
            type="checkbox"
            checked={model[type]}
            onChange={event => {
              model[type] = event.target.checked;
            }}
          />
          {type === 'requires' ? trans.__('Requires') : trans.__('Optional')}
        </label>
      )}
    </UseSignal>
  );
};

/**
 * The layout selector of the toolbar.
 */
const LayoutSelect = ({ model, trans }: IToolbarProps): JSX.Element => (
  <UseSignal signal={model.changed}>
    {() => (
      <HTMLSelect
        aria-label={trans.__('Layout')}
        value={model.layout}
        onChange={event => {
          model.layout = event.target.value as Layout;
        }}
      >
        <option value="force">{trans.__('Force layout')}</option>
        <option value="circular">{trans.__('Circular layout')}</option>
      </HTMLSelect>
    )}
  </UseSignal>
);

/**
 * The number of plugins and connections in the graph.
 */
const Counts = ({ model, trans }: IToolbarProps): JSX.Element => (
  <UseSignal signal={model.changed}>
    {() => {
      const { nodes, edges } = model.graph;
      const plugins = nodes.filter(node => node.kind !== 'token').length;
      return (
        <span className="jp-PluginGraph-counts">
          {trans._n('%1 plugin', '%1 plugins', plugins)}
          {' · '}
          {trans._n('%1 connection', '%1 connections', edges.length)}
        </span>
      );
    }}
  </UseSignal>
);

/**
 * A main area widget with the plugin graph and its toolbar.
 */
export class GraphContainer extends MainAreaWidget<Widget> {
  constructor(options: GraphContainer.IOptions) {
    const { model, themeManager } = options;
    const trans = (options.translator ?? nullTranslator).load(
      'jupyterlab_plugin_graph'
    );
    const graph = new Graph({ model, trans, themeManager });
    super({ content: graph });
    const props = { model, trans };
    const { toolbar } = this;
    toolbar.addItem('filter', ReactWidget.create(<Filter {...props} />));
    toolbar.addItem(
      'requires',
      ReactWidget.create(<Toggle {...props} type="requires" />)
    );
    toolbar.addItem(
      'optional',
      ReactWidget.create(<Toggle {...props} type="optional" />)
    );
    toolbar.addItem('layout', ReactWidget.create(<LayoutSelect {...props} />));
    toolbar.addItem(
      'zoom-in',
      new ToolbarButton({
        icon: zoomInIcon,
        tooltip: trans.__('Zoom in'),
        onClick: () => graph.zoom(ZOOM_STEP)
      })
    );
    toolbar.addItem(
      'zoom-out',
      new ToolbarButton({
        icon: zoomOutIcon,
        tooltip: trans.__('Zoom out'),
        onClick: () => graph.zoom(1 / ZOOM_STEP)
      })
    );
    toolbar.addItem('spacer', Toolbar.createSpacerItem());
    toolbar.addItem('counts', ReactWidget.create(<Counts {...props} />));
  }
}

/**
 * A namespace for the `GraphContainer` statics.
 */
export namespace GraphContainer {
  /**
   * The options to create a `GraphContainer`.
   */
  export interface IOptions {
    model: Model;
    themeManager?: IThemeManager | null;
    translator?: ITranslator | null;
  }
}

/**
 * A namespace for the private helpers.
 */
namespace Private {
  /**
   * Remove the `@jupyterlab/` scope, which most plugin ids share.
   */
  export function shortName(name: string): string {
    return name.replace(/^@jupyterlab\//, '');
  }

  /**
   * Create the tooltip of a node.
   */
  export function nodeTooltip(
    trans: TranslationBundle,
    node: INode
  ): HTMLElement {
    const { id, kind, description, provides, dependents, dependencies } = node;
    const rows: [string, string][] = [];
    if (kind === 'token') {
      rows.push([
        trans.__('Status'),
        trans.__('No plugin provides this service')
      ]);
    } else if (provides) {
      rows.push([trans.__('Provides'), provides]);
    }
    if (kind !== 'token') {
      rows.push([
        trans.__('Uses'),
        trans._n('%1 service', '%1 services', dependencies)
      ]);
    }
    if (kind !== 'plugin') {
      rows.push([
        trans.__('Used by'),
        trans._n('%1 plugin', '%1 plugins', dependents)
      ]);
    }
    return tooltip(id, description, rows);
  }

  /**
   * Create the tooltip of an edge.
   */
  export function edgeTooltip(
    trans: TranslationBundle,
    edge: IEdge
  ): HTMLElement {
    return tooltip(
      edge.optional
        ? trans.__('Optional dependency')
        : trans.__('Required dependency'),
      '',
      [
        [trans.__('From'), edge.source],
        [trans.__('To'), edge.target]
      ]
    );
  }

  /**
   * Create a tooltip. The texts come from the plugins, thus they go in the
   * DOM as text and not as HTML.
   */
  function tooltip(
    title: string,
    description: string,
    rows: [string, string][]
  ): HTMLElement {
    const root = document.createElement('div');
    const add = (parent: HTMLElement, tag: string, text: string): void => {
      parent.appendChild(document.createElement(tag)).textContent = text;
    };
    add(root, 'strong', title);
    if (description) {
      add(root, 'p', description);
    }
    const list = root.appendChild(document.createElement('dl'));
    for (const [term, value] of rows) {
      add(list, 'dt', term);
      add(list, 'dd', value);
    }
    return root;
  }
}
