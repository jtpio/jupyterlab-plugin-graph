import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  JupyterLab
} from '@jupyterlab/application';

import {
  ICommandPalette,
  IThemeManager,
  MainAreaWidget
} from '@jupyterlab/apputils';

import { ITranslator, nullTranslator } from '@jupyterlab/translation';

import { buildIcon } from '@jupyterlab/ui-components';

import { Model } from './model';

/**
 * The id of the command that opens the plugin graph.
 */
const COMMAND = 'jupyterlab-plugin-graph:open';

/**
 * Initialization data for the jupyterlab-plugin-graph extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-plugin-graph:plugin',
  description:
    'JupyterLab extension to show an interactive dependency graph of the installed plugins',
  autoStart: true,
  requires: [JupyterLab.IInfo],
  optional: [ICommandPalette, IThemeManager, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    info: JupyterLab.IInfo,
    palette: ICommandPalette | null,
    themeManager: IThemeManager | null,
    translator: ITranslator | null
  ) => {
    const trans = (translator ?? nullTranslator).load(
      'jupyterlab_plugin_graph'
    );
    let widget: MainAreaWidget | null = null;

    app.commands.addCommand(COMMAND, {
      label: trans.__('Plugin Dependency Graph'),
      caption: trans.__('Open the plugin dependency graph'),
      describedBy: { args: { type: 'object', properties: {} } },
      execute: async () => {
        if (!widget || widget.isDisposed) {
          // The import is lazy, thus ECharts loads only when the graph opens.
          const { GraphContainer } = await import('./widget');
          const model = new Model({ plugins: info.availablePlugins });
          widget = new GraphContainer({ model, themeManager, translator });
          widget.id = 'jupyterlab-plugin-graph';
          widget.title.label = trans.__('Plugin Graph');
          widget.title.icon = buildIcon;
        }
        if (!widget.isAttached) {
          app.shell.add(widget, 'main');
        }
        app.shell.activateById(widget.id);
      }
    });

    palette?.addItem({ command: COMMAND, category: trans.__('Developer') });
  }
};

export default plugin;
