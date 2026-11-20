import { GraphChart, GraphSeriesOption } from 'echarts/charts';

import * as echarts from 'echarts/core';

import { LabelLayout } from 'echarts/features';

import { CanvasRenderer } from 'echarts/renderers';

import { IGraph } from './model';

echarts.use([GraphChart, LabelLayout, CanvasRenderer]);

/**
 * The size of the off-screen chart. The visible chart scales the positions
 * to its own size.
 */
const SIZE = 800;

/**
 * The horizontal stretch of the layout. The labels are horizontal, thus the
 * nodes need more horizontal space.
 */
const STRETCH = 1.4;

/**
 * The force layout of ECharts, computed off-screen.
 *
 * ECharts does not fit its force layout in the view, and a chart computes
 * the layout again on each resize. Thus an off-screen chart computes the
 * positions, and the visible chart draws them as a fixed layout.
 */
export class ForceLayout {
  dispose(): void {
    this._chart.dispose();
  }

  /**
   * Compute the positions of the nodes of a graph, by node id.
   */
  compute(graph: IGraph): Map<string, number[]> {
    if (graph === this._graph) {
      return this._positions;
    }
    const positions = new Map<string, number[]>();
    const dependents = new Map(
      graph.nodes.map(node => [node.id, node.dependents])
    );
    this._chart.setOption<echarts.ComposeOption<GraphSeriesOption>>({
      animation: false,
      series: [
        {
          type: 'graph',
          layout: 'force',
          silent: true,
          // The value of a node sets its repulsion and its space in the initial
          // layout: it cannot be 0. The value of an edge sets its length: the
          // edges to the most used services are the longest.
          data: graph.nodes.map(({ id, dependents }) => ({
            id,
            name: id,
            value: dependents + 1
          })),
          links: graph.edges.map(({ source, target }) => ({
            source,
            target,
            value: -Math.log(dependents.get(target)!)
          })),
          label: { show: true },
          // The label layout is the only public API that gives the positions.
          labelLayout: ({ dataIndex, rect }) => {
            positions.set(graph.nodes[dataIndex!].id, [
              STRETCH * (rect.x + rect.width / 2),
              rect.y + rect.height / 2
            ]);
            return {};
          },
          force: {
            initLayout: 'circular',
            layoutAnimation: false,
            gravity: 0.3,
            repulsion: [300, 3000],
            edgeLength: [100, 300]
          }
        }
      ]
    });
    this._graph = graph;
    this._positions = positions;
    return positions;
  }

  private _chart = echarts.init(document.createElement('div'), null, {
    width: SIZE,
    height: SIZE
  });
  private _graph: IGraph | null = null;
  private _positions = new Map<string, number[]>();
}
