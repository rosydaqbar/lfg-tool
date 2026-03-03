# Voice Query Benchmark

- Captured at: 2026-03-03T20:59:37.881Z
- guildId: 670147766839803924
- userId sample: 111080662550732800
- Optimized stats execution: 1.650 ms
- Legacy stats execution (aggregate + rank): 1.847 ms

## Stats Query Plan (Optimized)
```text
Nested Loop Left Join  (cost=150.05..156.33 rows=1 width=32) (actual time=1.449..1.501 rows=1 loops=1)
  Buffers: shared hit=13
  CTE leaderboard
    ->  HashAggregate  (cost=142.52..144.16 rows=109 width=56) (actual time=1.289..1.326 rows=106 loops=1)
          Group Key: ((elem.value ->> 'userId'::text))
          Batches: 1  Memory Usage: 48kB
          Buffers: shared hit=7
          ->  Append  (cost=0.01..141.43 rows=109 width=40) (actual time=0.092..1.089 rows=474 loops=1)
                Buffers: shared hit=7
                ->  Nested Loop  (cost=0.01..139.49 rows=108 width=40) (actual time=0.092..1.017 rows=442 loops=1)
                      Buffers: shared hit=6
                      ->  Seq Scan on temp_voice_delete_logs logs  (cost=0.00..7.35 rows=108 width=282) (actual time=0.014..0.048 rows=108 loops=1)
                            Filter: (guild_id = '670147766839803924'::text)
                            Buffers: shared hit=6
                      ->  Memoize  (cost=0.01..1.26 rows=1 width=32) (actual time=0.002..0.004 rows=4 loops=108)
                            Cache Key: logs.history_json
                            Cache Mode: binary
                            Hits: 6  Misses: 102  Evictions: 0  Overflows: 0  Memory Usage: 74kB
                            ->  Function Scan on jsonb_array_elements elem  (cost=0.00..1.25 rows=1 width=32) (actual time=0.001..0.002 rows=4 loops=102)
                                  Filter: (value ? 'userId'::text)
                ->  Seq Scan on manual_voice_session_logs  (cost=0.00..1.40 rows=1 width=40) (actual time=0.014..0.023 rows=32 loops=1)
                      Filter: (guild_id = '670147766839803924'::text)
                      Buffers: shared hit=1
  ->  Nested Loop Left Join  (cost=0.00..2.47 rows=1 width=24) (actual time=1.359..1.361 rows=1 loops=1)
        Buffers: shared hit=7
        ->  Result  (cost=0.00..0.01 rows=1 width=0) (actual time=0.001..0.001 rows=1 loops=1)
        ->  CTE Scan on leaderboard l  (cost=0.00..2.45 rows=1 width=24) (actual time=1.357..1.358 rows=1 loops=1)
              Filter: (user_id = '111080662550732800'::text)
              Rows Removed by Filter: 105
              Buffers: shared hit=7
  ->  Subquery Scan on r  (cost=5.89..9.68 rows=1 width=8) (actual time=0.088..0.136 rows=1 loops=1)
        Filter: (r.user_id = '111080662550732800'::text)
        Rows Removed by Filter: 105
        Buffers: shared hit=6
        ->  WindowAgg  (cost=5.89..8.32 rows=109 width=56) (actual time=0.085..0.123 rows=106 loops=1)
              Buffers: shared hit=6
              ->  Sort  (cost=5.87..6.14 rows=109 width=48) (actual time=0.080..0.086 rows=106 loops=1)
                    Sort Key: leaderboard.total_ms DESC, leaderboard.sessions DESC, leaderboard.user_id
                    Sort Method: quicksort  Memory: 30kB
                    Buffers: shared hit=6
                    ->  CTE Scan on leaderboard  (cost=0.00..2.18 rows=109 width=48) (actual time=0.001..0.022 rows=106 loops=1)
Planning:
  Buffers: shared hit=42
Planning Time: 0.568 ms
Execution Time: 1.650 ms
```

## Stats Query Plan (Legacy Aggregate)
```text
Aggregate  (cost=194.18..194.19 rows=1 width=24) (actual time=0.459..0.460 rows=1 loops=1)
  Buffers: shared hit=7
  ->  Append  (cost=0.01..193.36 rows=109 width=8) (actual time=0.046..0.449 rows=33 loops=1)
        Buffers: shared hit=7
        ->  Subquery Scan on "*SELECT* 1"  (cost=0.01..191.33 rows=108 width=8) (actual time=0.045..0.428 rows=24 loops=1)
              Buffers: shared hit=6
              ->  Nested Loop  (cost=0.01..190.25 rows=108 width=40) (actual time=0.044..0.424 rows=24 loops=1)
                    Buffers: shared hit=6
                    ->  Seq Scan on temp_voice_delete_logs logs  (cost=0.00..7.35 rows=108 width=282) (actual time=0.021..0.051 rows=108 loops=1)
                          Filter: (guild_id = '670147766839803924'::text)
                          Buffers: shared hit=6
                    ->  Memoize  (cost=0.01..1.76 rows=1 width=32) (actual time=0.003..0.003 rows=0 loops=108)
                          Cache Key: logs.history_json
                          Cache Mode: binary
                          Hits: 6  Misses: 102  Evictions: 0  Overflows: 0  Memory Usage: 37kB
                          ->  Function Scan on jsonb_array_elements elem  (cost=0.00..1.75 rows=1 width=32) (actual time=0.002..0.002 rows=0 loops=102)
                                Filter: ((value ? 'userId'::text) AND ((value ->> 'userId'::text) = '111080662550732800'::text))
                                Rows Removed by Filter: 4
        ->  Subquery Scan on "*SELECT* 2"  (cost=0.00..1.49 rows=1 width=8) (actual time=0.008..0.017 rows=9 loops=1)
              Buffers: shared hit=1
              ->  Seq Scan on manual_voice_session_logs  (cost=0.00..1.48 rows=1 width=40) (actual time=0.007..0.015 rows=9 loops=1)
                    Filter: ((guild_id = '670147766839803924'::text) AND (user_id = '111080662550732800'::text))
                    Rows Removed by Filter: 23
                    Buffers: shared hit=1
Planning Time: 0.340 ms
Execution Time: 0.514 ms
```

## Stats Query Plan (Legacy Rank)
```text
Subquery Scan on ranked  (cost=147.60..151.39 rows=1 width=8) (actual time=1.219..1.268 rows=1 loops=1)
  Filter: (ranked.user_id = '111080662550732800'::text)
  Rows Removed by Filter: 105
  Buffers: shared hit=7
  ->  WindowAgg  (cost=147.60..150.03 rows=109 width=56) (actual time=1.215..1.254 rows=106 loops=1)
        Buffers: shared hit=7
        ->  Sort  (cost=147.58..147.85 rows=109 width=48) (actual time=1.211..1.218 rows=106 loops=1)
              Sort Key: ((sum((CASE WHEN ((elem.value ->> 'totalMs'::text) ~ '^[0-9]+$'::text) THEN ((elem.value ->> 'totalMs'::text))::bigint ELSE '0'::bigint END)))::bigint) DESC, (count(*)) DESC, ((elem.value ->> 'userId'::text))
              Sort Method: quicksort  Memory: 30kB
              Buffers: shared hit=7
              ->  HashAggregate  (cost=142.25..143.89 rows=109 width=48) (actual time=1.148..1.182 rows=106 loops=1)
                    Group Key: ((elem.value ->> 'userId'::text))
                    Batches: 1  Memory Usage: 48kB
                    Buffers: shared hit=7
                    ->  Append  (cost=0.01..141.43 rows=109 width=40) (actual time=0.037..0.983 rows=474 loops=1)
                          Buffers: shared hit=7
                          ->  Nested Loop  (cost=0.01..139.49 rows=108 width=40) (actual time=0.036..0.916 rows=442 loops=1)
                                Buffers: shared hit=6
                                ->  Seq Scan on temp_voice_delete_logs logs  (cost=0.00..7.35 rows=108 width=282) (actual time=0.014..0.047 rows=108 loops=1)
                                      Filter: (guild_id = '670147766839803924'::text)
                                      Buffers: shared hit=6
                                ->  Memoize  (cost=0.01..1.26 rows=1 width=32) (actual time=0.002..0.004 rows=4 loops=108)
                                      Cache Key: logs.history_json
                                      Cache Mode: binary
                                      Hits: 6  Misses: 102  Evictions: 0  Overflows: 0  Memory Usage: 74kB
                                      ->  Function Scan on jsonb_array_elements elem  (cost=0.00..1.25 rows=1 width=32) (actual time=0.001..0.002 rows=4 loops=102)
                                            Filter: (value ? 'userId'::text)
                          ->  Seq Scan on manual_voice_session_logs  (cost=0.00..1.40 rows=1 width=40) (actual time=0.008..0.018 rows=32 loops=1)
                                Filter: (guild_id = '670147766839803924'::text)
                                Buffers: shared hit=1
Planning Time: 0.370 ms
Execution Time: 1.333 ms
```

## Mixed Voice Log Query Plan
```text
Limit  (cost=12.99..13.24 rows=100 width=401) (actual time=0.215..0.231 rows=100 loops=1)
  Buffers: shared hit=7
  ->  Sort  (cost=12.99..13.26 rows=109 width=401) (actual time=0.213..0.220 rows=100 loops=1)
        Sort Key: temp_voice_delete_logs.deleted_at DESC
        Sort Method: quicksort  Memory: 94kB
        Buffers: shared hit=7
        ->  Append  (cost=0.00..9.30 rows=109 width=401) (actual time=0.014..0.147 rows=140 loops=1)
              Buffers: shared hit=7
              ->  Seq Scan on temp_voice_delete_logs  (cost=0.00..7.35 rows=108 width=403) (actual time=0.014..0.051 rows=108 loops=1)
                    Filter: (guild_id = '670147766839803924'::text)
                    Buffers: shared hit=6
              ->  Seq Scan on manual_voice_session_logs  (cost=0.00..1.40 rows=1 width=192) (actual time=0.018..0.082 rows=32 loops=1)
                    Filter: (guild_id = '670147766839803924'::text)
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=22
Planning Time: 0.880 ms
Execution Time: 0.270 ms
```
