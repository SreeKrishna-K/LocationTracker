import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class LocationPoint extends Model {
  static table = 'locations';

  @field('latitude') latitude;
  @field('longitude') longitude;
  @field('timestamp') timestamp;
  @field('synced') synced;
  @field('speed') speed;
  @field('accuracy') accuracy;
  @field('altitude') altitude;
  @field('heading') heading;
  @field('activity_type') activityType;
}
