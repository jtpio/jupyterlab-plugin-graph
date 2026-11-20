import { JupyterLab } from '@jupyterlab/application';

import { Model } from '../model';

const token = (name: string): JupyterLab.IToken => ({ name, description: '' });

const plugin = (
  id: string,
  options: Partial<JupyterLab.IPluginInfo> = {}
): JupyterLab.IPluginInfo => ({
  id,
  description: '',
  autoStart: true,
  requires: [],
  optional: [],
  provides: null,
  extension: 'test',
  enabled: true,
  ...options
});

const createModel = (): Model =>
  new Model({
    plugins: [
      plugin('test:consumer', {
        requires: [token('test:IProvided')],
        optional: [token('test:IMissing')]
      }),
      plugin('test:provider', { provides: token('test:IProvided') }),
      plugin('test:alone'),
      plugin('test:disabled', { enabled: false })
    ]
  });

describe('jupyterlab-plugin-graph', () => {
  describe('Model', () => {
    it('should create a node for each enabled plugin and missing service', () => {
      const { nodes } = createModel().graph;
      expect(nodes.map(({ id, kind }) => [id, kind])).toEqual([
        ['test:alone', 'plugin'],
        ['test:consumer', 'plugin'],
        ['test:provider', 'service'],
        ['test:IMissing', 'token']
      ]);
    });

    it('should connect a plugin to the plugin that provides the service', () => {
      const { nodes, edges } = createModel().graph;
      expect(edges).toEqual([
        { source: 'test:consumer', target: 'test:provider', optional: false },
        { source: 'test:consumer', target: 'test:IMissing', optional: true }
      ]);
      const provider = nodes.find(node => node.id === 'test:provider');
      const consumer = nodes.find(node => node.id === 'test:consumer');
      expect(provider?.dependents).toBe(1);
      expect(consumer?.dependencies).toBe(2);
    });

    it('should hide a type of dependency', () => {
      const model = createModel();
      model.optional = false;
      expect(model.graph.edges).toHaveLength(1);
      expect(model.graph.nodes.map(node => node.id)).not.toContain(
        'test:IMissing'
      );
      model.requires = false;
      expect(model.graph.edges).toHaveLength(0);
    });

    it('should keep the nodes that match the filter and their neighbors', () => {
      const model = createModel();
      model.filter = 'IPROVIDED';
      expect(model.graph.nodes.map(({ id, matched }) => [id, matched])).toEqual(
        [
          ['test:consumer', false],
          ['test:provider', true]
        ]
      );
      expect(model.graph.edges).toHaveLength(1);
    });

    it('should keep the graph when the layout changes', () => {
      const model = createModel();
      const { graph } = model;
      model.layout = 'circular';
      expect(model.graph).toBe(graph);
      model.filter = 'test';
      expect(model.graph).not.toBe(graph);
    });

    it('should emit a signal only when a value changes', () => {
      const model = createModel();
      const listener = jest.fn();
      model.changed.connect(listener);
      model.filter = 'test';
      model.filter = 'test';
      model.layout = 'circular';
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });
});
