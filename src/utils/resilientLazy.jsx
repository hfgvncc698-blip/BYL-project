import React from 'react';

const moduleFailures = new WeakSet();
const isNetworkImportFailure = error => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\d]+ failed|Unable to preload CSS/i.test(String(error?.message || ''));

// Only failed code downloads are contained. Rendering errors still reach the
// application boundary. No identity, business data or storage is handled here.
export function resilientLazy(loader) {
  const create = () => React.lazy(() => loader().catch(error => {
    if (isNetworkImportFailure(error)) moduleFailures.add(error);
    throw error;
  }));
  // Keep the initial lazy identity stable when Suspense retries an unmounted tree.
  const Initial = create();
  return class DownloadBoundary extends React.Component {
    state = {error: null, Component: Initial};
    static getDerivedStateFromError(error) { return {error}; }
    componentDidMount() { window.addEventListener('online', this.retry); }
    componentWillUnmount() { window.removeEventListener('online', this.retry); }
    retry = () => {
      if (this.state.error && moduleFailures.has(this.state.error)) {
        this.setState({error: null, Component: create()});
      }
    };
    render() {
      const {error, Component} = this.state;
      if (error) {
        if (!moduleFailures.has(error)) throw error;
        return <div role="status" data-module-unavailable="true">
          <p>Une partie de cette page n’a pas pu être chargée. Vérifiez votre connexion puis réessayez. Votre travail ouvert est conservé.</p>
          <button type="button" onClick={this.retry}>Réessayer le chargement</button>
        </div>;
      }
      return <Component {...this.props} />;
    }
  };
}
