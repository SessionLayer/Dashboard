import { endpointConfigError } from './config/runtime';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

// The endpoints are read before anything imports the API client, so a bad one
// is a message on the page rather than a blank document and a console entry
// nobody is watching. That ordering is what makes the import below dynamic.
const fatal = endpointConfigError();
if (fatal === undefined) {
  void import('./bootstrap').then((app) => {
    app.start(rootElement);
  });
} else {
  const panel = document.createElement('pre');
  panel.className = 'startup-failure';
  panel.textContent = `SessionLayer Dashboard cannot start.\n\n${fatal}`;
  rootElement.replaceChildren(panel);
}
