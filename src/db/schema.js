import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schemas = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'locations',
      columns: [
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'timestamp', type: 'number' },
        { name: 'synced', type: 'boolean' },
      ],
    }),
  ],
});
