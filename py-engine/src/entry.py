import json

from workers import WorkerEntrypoint, Response

try:
    from .generator_engine import generate_tickets
except ImportError:
    from generator_engine import generate_tickets


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        try:
            url = str(request.url)
            print(f"[DEBUG] entry.py: Received request: {request.method} {url}")

            if url.endswith('/health'):
                return Response(
                    json.dumps({'status': 'ok', 'service': 'python-engine'}),
                    headers={'Content-Type': 'application/json'},
                )

            if url.endswith('/recalculate-weights'):
                print(f"[DEBUG] entry.py: Matched /recalculate-weights endpoint")
                if request.method != 'POST':
                    return Response(
                        json.dumps({'ok': False, 'error': 'Method Not Allowed'}),
                        status=405,
                        headers={'Content-Type': 'application/json'},
                    )

                try:
                    from .lotto_update import recalculate_weights
                except ImportError:
                    from lotto_update import recalculate_weights

                import os
                import tempfile

                with tempfile.NamedTemporaryFile(mode='w', suffix='.jsonl', delete=False) as f:
                    history_path = f.name

                with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                    weights_path = f.name

                try:
                    body = await request.json()
                    draws = body.get('draws', [])
                    weights_window = int(body.get('weightsWindow', 300))
                    cluster_window = int(body.get('clusterWindow', 150))
                    print(f"[DEBUG] entry.py: Received {len(draws)} draws from main Worker")

                    with open(history_path, 'w') as f:
                        for draw in draws:
                            if isinstance(draw.get('numbers_json'), str):
                                try:
                                    draw['numbers'] = json.loads(draw['numbers_json'])
                                except:
                                    draw['numbers'] = []
                            else:
                                draw['numbers'] = draw.get('numbers_json', [])

                            if draw.get('raw_json'):
                                if isinstance(draw['raw_json'], str):
                                    f.write(draw['raw_json'] + '\n')
                                else:
                                    f.write(json.dumps(draw['raw_json']) + '\n')
                            else:
                                raw_draw_id = draw.get('draw_id')
                                normalized_draw_id = None
                                try:
                                    if raw_draw_id is not None:
                                        normalized_draw_id = int(raw_draw_id)
                                except (TypeError, ValueError):
                                    normalized_draw_id = None

                                draw_obj = {
                                    'id': normalized_draw_id,
                                    'endsAt': draw.get('draw_date'),
                                    'numbers': draw.get('numbers', []),
                                    'strong': draw.get('strong_number'),
                                    'paisId': draw.get('pais_id'),
                                }
                                f.write(json.dumps(draw_obj) + '\n')

                    print(f"[DEBUG] entry.py: Wrote {len(draws)} draws to history file")
                    print(f"[DEBUG] entry.py: Calling recalculate_weights")
                    weights_data = recalculate_weights(
                        history_path=history_path,
                        weights_path=weights_path,
                        weights_window=weights_window,
                        cluster_window=cluster_window,
                    )
                    print(f"[DEBUG] entry.py: recalculate_weights returned")

                    return Response(
                        json.dumps({'ok': True, 'weights': weights_data}),
                        headers={'Content-Type': 'application/json'},
                    )

                finally:
                    for path in [history_path, weights_path]:
                        try:
                            os.unlink(path)
                        except:
                            pass

            if request.method != 'POST':
                return Response(
                    json.dumps({'ok': False, 'error': 'Method Not Allowed'}),
                    status=405,
                    headers={'Content-Type': 'application/json'},
                )

            body = await request.json()

            count = int(body.get('count', 10))
            max_common = int(body.get('maxCommon', 3))
            seed = body.get('seed')
            cluster_target = body.get('clusterTarget')
            weights = body.get('weights')
            history_tickets = body.get('historyTickets')

            if cluster_target is not None:
                cluster_target = int(cluster_target)

            tickets = generate_tickets(
                count=count,
                max_common=max_common,
                seed=seed,
                cluster_target=cluster_target,
                weights=weights,
                history_tickets_input=history_tickets,
            )

            return Response(
                json.dumps({
                    'ok': True,
                    'tickets': tickets,
                    'count': len(tickets),
                }),
                headers={'Content-Type': 'application/json'},
            )

        except Exception as e:
            return Response(
                json.dumps({'ok': False, 'error': str(e)}),
                status=500,
                headers={'Content-Type': 'application/json'},
            )

