"""Generate the same class timetable in plain Python and check the web export.

This small standard-library tool is independent of the browser. Times, class
counts and group size allocation are read from the saved comparison results.
"""
from pathlib import Path
import csv
import json
import math

ROOT=Path(__file__).resolve().parents[1]

def departure_slots(class_counts, order, gap_seconds):
    slots=[]
    for round_index in range(max(class_counts)):
        for position, grade in enumerate(order):
            if round_index < class_counts[grade]:
                seconds=(round_index*len(order)+position)*gap_seconds
                slots.append((grade, round_index, seconds))
    return slots

def clock(seconds):
    hours,remain=divmod(round(seconds),3600)
    minutes,seconds=divmod(remain,60)
    return f'{hours:02}:{minutes:02}:{seconds:02}'

def timetable(study):
    selected=next(r for r in study['verification'] if r['id']=='combined')
    grades=selected['config']['grades']
    counts=[g['classes'] for g in grades]
    order=study['protocol']['options']['order']
    gap=study['selectedSeconds']
    start=(680+max(g['readyTime'] for g in grades if g['students']))*60
    rows=[]
    for grade,index,seconds in departure_slots(counts,order,gap):
        g=grades[grade]
        count=math.ceil((index+1)*g['students']/g['classes'])-math.ceil(index*g['students']/g['classes'])
        rows.append({'方案':'年级与班级结合错峰','相邻组间隔秒':str(gap),'年级':g['name'],'班序':str(index+1),'人数':str(count),'出发时刻':clock(start+seconds)})
    return rows

if __name__=='__main__':
    study=json.loads((ROOT/'data/schedule-study-results.json').read_text('utf-8'))
    rows=timetable(study)
    with (ROOT/'data/schedule-study-timetable.csv').open(encoding='utf-8-sig',newline='') as f:
        assert rows==list(csv.DictReader(f)), 'Python and JavaScript timetables differ'
    output=ROOT/'data/schedule-python-timetable.csv'
    with output.open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    assert len(rows)==33 and sum(int(r['人数']) for r in rows)==1610
    receipt={'passed':True,'rows':len(rows),'students':1610,'gapSeconds':study['selectedSeconds'],'matchesJavaScriptExport':True,'source':'tools/student_schedule.py'}
    (ROOT/'qa').mkdir(exist_ok=True)
    (ROOT/'qa/schedule-python-audit.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=False))
