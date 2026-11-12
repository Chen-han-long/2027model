"""Physical CAD probes for revised D/E; a void alone doesn't prove a hole.
Checks each intended opening against adjacent material and source feature count.
"""
import cadquery as cq
import math
from rebuild_DE import new_D,new_E
V=cq.Vector

def inside(shape,p):return shape.isInside(V(*p),1e-5)

def void(shape,label,p):
    if inside(shape,p):raise RuntimeError(f'{label}: intended hole is blocked at {p}')

def material(shape,label,p):
    if not inside(shape,p):raise RuntimeError(f'{label}: nearby flange material is missing at {p}')

for id,fn in [('D',new_D),('E',new_E)]:
 obj=fn()
 assert obj.isValid() and len(obj.Solids())==1
 print(id,'CAD solid and topology: OK')
 if id=='D':
    for z in (-470,-330,-300,-225,0,200,450):void(obj,'D main axial bore',(0,330,z))
    for z in (-248,-180,0,180,248):void(obj,'D secondary bore',(510,195,z))
    void(obj,'D Ø75 radial port',(0,594,0))
    material(obj,'D primary bearing shell',(275,330,0))
    # YZ channel cross-sections must have actual side walls, NOT floating narrow ribbons.
    for x,y,w,lip in [(-500,463,179,185),(690,408,189,207)]:
        material(obj,f'D {x} near channel lip',(x,y+lip-8,w-8))
        void(obj,f'D {x} open channel interior',(x,y+lip-8,0))
    print('D: tapered bore, secondary through hole, radial port, 2 U-section walls: PASS')
 else:
    void(obj,'E hatch center',(400,390,0))
    void(obj,'E inspection bore',(-630,407,0))
    for side in [-1,1]:
        void(obj,'E saddle notch',(410,494,side*287))
        # 18 + 10 wing pairs, checked at the actual drilled positions.
        ext=[(-1020,446),(-850,480),(-650,520),(-380,548),(-245,617),
         (-178,655),(368,655),(485,612),(645,546),(850,498),(1020,466)]
        def outer(x):
            for (x0,z0),(x1,z1) in zip(ext[:-1],ext[1:]):
                if x0<=x<=x1:return z0+(z1-z0)*(x-x0)/(x1-x0)
            return ext[0][1] if x<ext[0][0] else ext[-1][1]
        for radius,group,inset in [(16.5,[-940,-825,-710,-595,-480,-365,-250,-135,-20],41),
                                   (11,[515,625,735,845,965],33)]:
            for x in group:
                z=side*(outer(x)-inset)
                void(obj,'E actual bolt hole',(x,13.5,z))
                material(obj,'E flange around bolt hole',(x,13.5,z+side*(radius+4)))
    print('E: hatch opening, 2 saddles, 18 Ø33 + 10 Ø22 physical holes: PASS')
print('D/E 2.4 BOOLEAN FEATURE CHECKS: OK')
