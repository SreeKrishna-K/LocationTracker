import { registerRootComponent } from 'expo';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { database } from './src/db/database';
import App from './App';

function Root() {
  return (
    <DatabaseProvider database={database}>
      <App />
    </DatabaseProvider>
  );
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
