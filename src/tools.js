const { WhoopClient } = require('./whoop');

function getClient() {
  const token = process.env.WHOOP_ACCESS_TOKEN;
  if (!token) throw new Error('WHOOP_ACCESS_TOKEN not set');
  return new WhoopClient(token);
}

function msToHours(ms) {
  return (ms / 3600000).toFixed(1);
}

function msToMinutes(ms) {
  return Math.round(ms / 60000);
}

const tools = [
  {
    name: 'get_profile',
    description: 'Get the athlete\'s Whoop profile including name and email',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const client = getClient();
      const [profile, body] = await Promise.all([
        client.getProfile(),
        client.getBodyMeasurements(),
      ]);
      return {
        user_id: profile.user_id,
        name: `${profile.first_name} ${profile.last_name}`,
        email: profile.email,
        height_m: body.height_meter,
        weight_kg: body.weight_kilogram,
        max_heart_rate: body.max_heart_rate,
      };
    },
  },
  {
    name: 'get_recovery',
    description:
      'Get recent recovery scores including HRV, resting heart rate, SpO2, and skin temperature. Essential for readiness-to-train decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default 7)',
          default: 7,
        },
      },
    },
    handler: async ({ days = 7 }) => {
      const client = getClient();
      const start = new Date(Date.now() - days * 86400000).toISOString();
      const data = await client.getRecoveries(Math.min(days, 25), start);

      return {
        total: data.records.length,
        recoveries: data.records.map((r) => ({
          date: r.created_at?.split('T')[0],
          recovery_score: r.score?.recovery_score,
          hrv_rmssd: r.score?.hrv_rmssd_milli
            ? Math.round(r.score.hrv_rmssd_milli * 10) / 10
            : null,
          resting_heart_rate: r.score?.resting_heart_rate,
          spo2_pct: r.score?.spo2_percentage
            ? Math.round(r.score.spo2_percentage * 10) / 10
            : null,
          skin_temp_c: r.score?.skin_temp_celsius
            ? Math.round(r.score.skin_temp_celsius * 10) / 10
            : null,
          score_state: r.score_state,
        })),
      };
    },
  },
  {
    name: 'get_sleep',
    description:
      'Get recent sleep data including duration, stages (light/deep/REM), sleep performance, efficiency, respiratory rate, and sleep needed.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default 7)',
          default: 7,
        },
      },
    },
    handler: async ({ days = 7 }) => {
      const client = getClient();
      const start = new Date(Date.now() - days * 86400000).toISOString();
      const data = await client.getSleeps(Math.min(days, 25), start);

      return {
        total: data.records.length,
        sleeps: data.records
          .filter((s) => !s.nap)
          .map((s) => {
            const stages = s.score?.stage_summary;
            const needed = s.score?.sleep_needed;
            return {
              date: s.start?.split('T')[0],
              start: s.start,
              end: s.end,
              is_nap: s.nap,
              total_in_bed_hrs: stages
                ? msToHours(stages.total_in_bed_time_milli)
                : null,
              total_awake_min: stages
                ? msToMinutes(stages.total_awake_time_milli)
                : null,
              light_sleep_hrs: stages
                ? msToHours(stages.total_light_sleep_time_milli)
                : null,
              deep_sleep_hrs: stages
                ? msToHours(stages.total_slow_wave_sleep_time_milli)
                : null,
              rem_sleep_hrs: stages
                ? msToHours(stages.total_rem_sleep_time_milli)
                : null,
              sleep_cycles: stages?.sleep_cycle_count,
              disturbances: stages?.disturbance_count,
              sleep_needed_hrs: needed
                ? msToHours(
                    needed.baseline_milli +
                      (needed.need_from_sleep_debt_milli || 0) +
                      (needed.need_from_recent_strain_milli || 0) +
                      (needed.need_from_recent_nap_milli || 0)
                  )
                : null,
              sleep_performance_pct: s.score?.sleep_performance_percentage,
              sleep_efficiency_pct: s.score?.sleep_efficiency_percentage
                ? Math.round(s.score.sleep_efficiency_percentage * 10) / 10
                : null,
              sleep_consistency_pct: s.score?.sleep_consistency_percentage,
              respiratory_rate: s.score?.respiratory_rate
                ? Math.round(s.score.respiratory_rate * 10) / 10
                : null,
            };
          }),
      };
    },
  },
  {
    name: 'get_strain',
    description:
      'Get recent daily strain data including day strain score, kilojoules burned, and heart rate stats from physiological cycles.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default 7)',
          default: 7,
        },
      },
    },
    handler: async ({ days = 7 }) => {
      const client = getClient();
      const start = new Date(Date.now() - days * 86400000).toISOString();
      const data = await client.getCycles(Math.min(days, 25), start);

      return {
        total: data.records.length,
        cycles: data.records.map((c) => ({
          date: c.start?.split('T')[0],
          strain: c.score?.strain
            ? Math.round(c.score.strain * 100) / 100
            : null,
          kilojoules: c.score?.kilojoule
            ? Math.round(c.score.kilojoule)
            : null,
          avg_heart_rate: c.score?.average_heart_rate,
          max_heart_rate: c.score?.max_heart_rate,
          score_state: c.score_state,
        })),
      };
    },
  },
  {
    name: 'get_workouts',
    description:
      'Get recent Whoop-tracked workouts including sport type, strain, heart rate, kilojoules, distance, and HR zone durations.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default 14)',
          default: 14,
        },
      },
    },
    handler: async ({ days = 14 }) => {
      const client = getClient();
      const start = new Date(Date.now() - days * 86400000).toISOString();
      const data = await client.getWorkouts(25, start);

      return {
        total: data.records.length,
        workouts: data.records.map((w) => {
          const zones = w.score?.zone_durations;
          return {
            id: w.id,
            date: w.start?.split('T')[0],
            sport: w.sport_name,
            start: w.start,
            end: w.end,
            strain: w.score?.strain
              ? Math.round(w.score.strain * 100) / 100
              : null,
            avg_heart_rate: w.score?.average_heart_rate,
            max_heart_rate: w.score?.max_heart_rate,
            kilojoules: w.score?.kilojoule
              ? Math.round(w.score.kilojoule)
              : null,
            distance_km: w.score?.distance_meter
              ? Math.round(w.score.distance_meter / 10) / 100
              : null,
            elevation_gain_m: w.score?.altitude_gain_meter
              ? Math.round(w.score.altitude_gain_meter)
              : null,
            hr_zones_min: zones
              ? {
                  zone_0: msToMinutes(zones.zone_zero_milli || 0),
                  zone_1: msToMinutes(zones.zone_one_milli || 0),
                  zone_2: msToMinutes(zones.zone_two_milli || 0),
                  zone_3: msToMinutes(zones.zone_three_milli || 0),
                  zone_4: msToMinutes(zones.zone_four_milli || 0),
                  zone_5: msToMinutes(zones.zone_five_milli || 0),
                }
              : null,
          };
        }),
      };
    },
  },
  {
    name: 'get_weekly_summary',
    description:
      'Get a weekly summary of recovery, sleep, and strain trends. Shows averages and trends over the specified number of weeks.',
    inputSchema: {
      type: 'object',
      properties: {
        weeks: {
          type: 'number',
          description: 'Number of weeks to look back (default 4)',
          default: 4,
        },
      },
    },
    handler: async ({ weeks = 4 }) => {
      const client = getClient();
      const days = weeks * 7;
      const start = new Date(Date.now() - days * 86400000).toISOString();

      const [recoveries, sleeps, cycles] = await Promise.all([
        client.getRecoveries(25, start),
        client.getSleeps(25, start),
        client.getCycles(25, start),
      ]);

      // Group by ISO week
      const weekMap = {};

      const getWeekKey = (dateStr) => {
        const d = new Date(dateStr);
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(
          ((d - jan1) / 86400000 + jan1.getDay() + 1) / 7
        );
        return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      };

      const ensure = (key) => {
        if (!weekMap[key])
          weekMap[key] = {
            recovery_scores: [],
            hrvs: [],
            rhrs: [],
            sleep_hours: [],
            sleep_performance: [],
            strains: [],
            kilojoules: [],
          };
      };

      recoveries.records.forEach((r) => {
        if (!r.created_at || r.score_state !== 'SCORED') return;
        const key = getWeekKey(r.created_at);
        ensure(key);
        if (r.score?.recovery_score != null)
          weekMap[key].recovery_scores.push(r.score.recovery_score);
        if (r.score?.hrv_rmssd_milli != null)
          weekMap[key].hrvs.push(r.score.hrv_rmssd_milli);
        if (r.score?.resting_heart_rate != null)
          weekMap[key].rhrs.push(r.score.resting_heart_rate);
      });

      sleeps.records.forEach((s) => {
        if (!s.start || s.nap || s.score_state !== 'SCORED') return;
        const key = getWeekKey(s.start);
        ensure(key);
        if (s.score?.stage_summary?.total_in_bed_time_milli != null)
          weekMap[key].sleep_hours.push(
            s.score.stage_summary.total_in_bed_time_milli / 3600000
          );
        if (s.score?.sleep_performance_percentage != null)
          weekMap[key].sleep_performance.push(
            s.score.sleep_performance_percentage
          );
      });

      cycles.records.forEach((c) => {
        if (!c.start || c.score_state !== 'SCORED') return;
        const key = getWeekKey(c.start);
        ensure(key);
        if (c.score?.strain != null) weekMap[key].strains.push(c.score.strain);
        if (c.score?.kilojoule != null)
          weekMap[key].kilojoules.push(c.score.kilojoule);
      });

      const avg = (arr) =>
        arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
      const sum = (arr) =>
        arr.length ? Math.round(arr.reduce((a, b) => a + b, 0)) : null;

      const weeklyData = Object.entries(weekMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, data]) => ({
          week,
          avg_recovery: avg(data.recovery_scores),
          avg_hrv: avg(data.hrvs),
          avg_rhr: avg(data.rhrs),
          avg_sleep_hrs: avg(data.sleep_hours),
          avg_sleep_performance: avg(data.sleep_performance),
          avg_daily_strain: avg(data.strains),
          total_kilojoules: sum(data.kilojoules),
          days_scored: data.recovery_scores.length,
        }));

      return { weeks: weeklyData };
    },
  },
];

module.exports = { tools };
