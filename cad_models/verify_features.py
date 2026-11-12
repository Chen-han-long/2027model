"""Rebuild every CAD entity and verify documented holes are real voids.

Sampled point-in-solid checks do NOT prove all faces are manufacturable; they do
catch the common fault where a body behind a flange refills its bolt bores.
"""
import json,math,sys
from pathlib import Path
import cadquery as cq
from generate import BUILDERS,screw_circle
V=cq.Vector
TAU=math.tau

def radial(n,pitch,center,axis=(0,0,1),phase=0):
    return [tuple(v.toTuple()) for v in screw_circle(n,pitch,center,axis,phase=phase)]

def test(label,specs):
    for name,slots in specs:
        obj=BUILDERS[name]()
        if not obj.isValid() or len(obj.Solids())!=1: raise RuntimeError(f'{name} invalid solid')
        for title,pts in slots:
            blocked=[(i,tuple(round(v,2) for v in p)) for i,p in enumerate(pts) if obj.isInside(V(*p),1e-5)]
            if blocked:raise RuntimeError(f'{name} {title}: {len(blocked)} blocked/false holes: {blocked[:4]}')
            print(f'PASS {name} {title}: {len(pts)} physical openings')

specs={
 'A':[
  ('24 M16 pitch circle',[(796*math.cos(i*TAU/24),80,-796*math.sin(i*TAU/24)) for i in range(24)]),
  ('4 M24 hub',[(290*math.cos(i*TAU/4),53,-290*math.sin(i*TAU/4))for i in range(4)]),
  ('8 obround slots',[(686*math.cos(i*TAU/8),38,-686*math.sin(i*TAU/8))for i in range(8)])],
 'B':[
  ('8 flange bores',radial(8,117,(53,283,190),phase=math.pi/8)),
  ('base mounting 4',[(x,13,z)for x in [-143,143]for z in [-164,164]]),
  ('M8 smaller base 4',[(x,13,z)for x in [-133,133]for z in [-92,92]])],
 'D':[
  ('X-X stepped main bore',[(0,330,z)for z in [-470,-330,-300,-200,0,300,450]]),
  ('Y-Y secondary through bore',[(510,195,z)for z in [-248,0,248]]),
  ('top Ø75 radial bore',[(0,594,0)])],
 'E':[
  ('inspection hatch opening',[(400,390,0)]),
  ('inspection boss Ø80', [(-630,407,0)]),
  ('18 × Ø33 wing drilled bores',[(x,13.5,sign*z)for sign in [-1,1] for x,z in
      [(-940,421),(-825,444),(-710,467),(-595,485),(-480,497),(-365,510),(-250,572),(-135,614),(-20,614)]]),
  ('10 × Ø22 wing bores',[(x,13.5,sign*z)for sign in [-1,1] for x,z in
      [(515,568),(625,521),(735,492),(845,466),(965,443)]])],
 'F':[
  ('upper Ø40 pair',[(x,108,0)for x in [-143,143]]),
  ('6 front bores',[(x,y,0)for x,y in [(-188,28),(-172,57),(-109,68),(109,68),(172,57),(188,28)]])],
 'G':[
  ('12 face fixing bores',radial(12,266,(0,416,458),phase=math.pi/12)),
  ('three upper Ø79 openings',[(x,828,460)for x in [-155,0,155]]),
  ('18 upper pilot bores',[(x+54*math.cos(i*TAU/6),828+54*math.sin(i*TAU/6),475)for x in [-155,0,155]for i in range(6)])],
 'H':[
  ('12 Ø18 face bores',radial(12,252,(0,565,325),phase=math.pi/12)),
  ('4 M16 face bores',radial(4,236,(0,565,325))),
  ('3 Ø71 manifold',[(x,155,340)for x in [-130,0,130]]),
  ('18 ST10 pilot',[ (x+47*math.cos(i*TAU/6),155+47*math.sin(i*TAU/6),345) for x in [-130,0,130]for i in range(6)]),
  ('6 top M10 pilot',radial(6,47,(0,889,0),(0,1,0),math.pi/6))],
}
for name,slots in specs.items():
    obj=BUILDERS[name]()
    if not obj.isValid() or len(obj.Solids())!=1:raise RuntimeError(f'{name} invalid CAD: {len(obj.Solids())} solids')
    for title,pts in slots:
        blocked=[(i,p)for i,p in enumerate(pts)if obj.isInside(V(*p),1e-5)]
        if blocked:raise RuntimeError(f'{name} {title}: {len(blocked)} blocked holes {blocked[:2]}')
        print(f'PASS {name}: {title}: {len(pts)} checked voids',flush=True)
print('VALIDATION PASSED: 7 CAD solids, dimensioned and provisional holes unobstructed')
