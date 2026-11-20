import { LabIcon } from '@jupyterlab/ui-components';

/**
 * Create the magnifier of the JupyterLab search icon, with a sign in the lens.
 */
const magnifier = (sign: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" viewBox="0 0 18 18"><path class="jp-icon3" fill="#616161" d="M12.1 10.9h-.7l-.2-.2c.8-.9 1.3-2.2 1.3-3.5 0-3-2.4-5.4-5.4-5.4S1.8 4.2 1.8 7.1s2.4 5.4 5.4 5.4c1.3 0 2.5-.5 3.5-1.3l.2.2v.7l4.1 4.1 1.2-1.2zm-5 0c-2.1 0-3.7-1.7-3.7-3.7s1.7-3.7 3.7-3.7 3.7 1.7 3.7 3.7-1.6 3.7-3.7 3.7${sign}"/></svg>`;

export const zoomInIcon = new LabIcon({
  name: 'jupyterlab-plugin-graph:zoom-in',
  svgstr: magnifier('M5.2 6.6h1.5V5.1h1v1.5h1.5v1H7.7v1.5h-1V7.6H5.2z')
});

export const zoomOutIcon = new LabIcon({
  name: 'jupyterlab-plugin-graph:zoom-out',
  svgstr: magnifier('M5.2 6.6h4v1h-4z')
});
