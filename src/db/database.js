import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schemas } from './schema';
import migrations from './migrations';
import LocationPoint from './models/Location';

const adapter = new SQLiteAdapter({
  schema: schemas,
  migrations,
  dbName: 'locationtracker',
  jsi: true,
  onSetUpError: error => {
    console.error('Database setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [LocationPoint],
});
