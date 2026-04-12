import random
import json
from workers import Response
from lottery_generator import build_final_ticket

def fetch(request):
    data = json.loads(request.body)
    count = data.get('count', 10)
    seed = data.get('seed')
    
    rng = random.Random(seed) if seed else random.Random()
    
    tickets = []
    for _ in range(count):
        nums, ctrl, _ = build_final_ticket(rng)
        tickets.append({
            'numbers': list(nums),
            'control': ctrl
        })
    
    return Response(json.dumps(tickets), headers={'Content-Type': 'application/json'})
