import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        {
          type: 'add_columns',
          table: 'locations',
          columns: [
            { name: 'speed', type: 'number', isOptional: true },
            { name: 'accuracy', type: 'number', isOptional: true },
            { name: 'altitude', type: 'number', isOptional: true },
            { name: 'heading', type: 'number', isOptional: true },
            { name: 'activity_type', type: 'string', isOptional: true },
          ],
        },
      ],
    },
  ],
});
