import type { Activity } from '@/models/activity'

export interface SerializedActivity extends Omit<Activity, 'date'> {
  date?: string
}

export function serializeActivity(activity: Activity): SerializedActivity {
  return {
    ...activity,
    date: activity.date?.toISOString(),
  }
}

export function deserializeActivity(s: SerializedActivity): Activity {
  return {
    ...s,
    date: s.date ? new Date(s.date) : undefined,
  }
}

export function serializeActivities(activities: Activity[]): SerializedActivity[] {
  return activities.map(serializeActivity)
}

export function deserializeActivities(serialized: SerializedActivity[]): Activity[] {
  return serialized.map(deserializeActivity)
}
