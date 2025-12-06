import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schemas = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'locations',
      columns: [
        { name: 'latitude', type: 'number' },
        { name: 'longitude', type: 'number' },
        { name: 'timestamp', type: 'number' },
        { name: 'synced', type: 'boolean' },
        { name: 'speed', type: 'number', isOptional: true },
        { name: 'accuracy', type: 'number', isOptional: true },
        { name: 'altitude', type: 'number', isOptional: true },
        { name: 'heading', type: 'number', isOptional: true },
        { name: 'activity_type', type: 'string', isOptional: true },
      ],
    }),
  ],
});
