"""Drawing-grounded D/E replacement solids, preserving the site and other parts.

Run: python cad_models/rebuild_DE.py D E
Requires CadQuery, vtk, trimesh. The unlabelled freeform casting transitions
remain approximations and are NOT certified manufacturing geometry.
"""
from pathlib import Path
import math, sys, json
import cadquery as cq
from cadquery import Vector
import generate as gen

V=Vector
ROOT=Path(__file__).resolve().parent.parent


def polyXZ(points,thick=26,y=13):
    # XZ workplane extrusion normal is -Y.
    return cq.Workplane('XZ', origin=(0,y+thick/2,0)).polyline(points).close().extrude(thick).val()


def u_channel(stations,wall=20):
    """3D loft of an actual U channel, not zero-thickness elevated wings.

    stations: (x, bottom_y, half_width_z, lip_height)
    """
    wires=[]
    for x,y,w,lip in stations:
        t=min(wall,w*.26)
        yz=[(-w,y+lip),(-w,y), (w,y), (w,y+lip),
            (w-t,y+lip),(w-t,y+wall),(-w+t,y+wall),(-w+t,y+lip)]
        pts=[V(x,Y,Z) for Z,Y in yz]
        wires.append(cq.Wire.makePolygon(pts+[pts[0]]))
    return cq.Solid.makeLoft(wires,ruled=True)


def tapered_bearing():
    # X-X section: OD Ø620 near left face and Ø550 on opposite end, length 971.
    # Machined internal diameters Ø325, Ø100, Ø480 with 2° right taper.
    outer=cq.Solid.makeCone(310,275,971,V(0,330,-485.5),V(0,0,1))
    cutters=[
        gen.cyl(162.5,153,(0,330,-414)),  # -490 .. -337.5
        gen.cyl(50,68,(0,330,-305)),      # -339 .. -271
        cq.Solid.makeCone(50,240,164,V(0,330,-276),V(0,0,1)),
        cq.Solid.makeCone(240,260.8,605,V(0,330,-113),V(0,0,1))
    ]
    # Use cutters individually; CAD kernel handles multi-stage counterbores.
    for c in cutters:outer=outer.cut(c)
    return outer.clean(),cutters


def new_D():
    main,cutters=tapered_bearing()
    # Y-Y detail: the second bearing is a vertical cast ear with an axial bore.
    secondary=gen.hollow(163,110,510,(510,195,0))
    # T-T outline has a concave wall on each side, transitioning into the
    # two bearing bodies. Left/right wings are independent supported channels.
    left=u_channel([
        (-1045,603,105,48),(-850,572,120,86),(-680,531,153,132),
        (-500,463,179,185),(-355,397,205,238),(-230,413,246,214)
    ],wall=21)
    right=u_channel([
        (210,455,252,161),(355,421,243,182),(510,387,218,182),
        (690,408,189,207),(855,505,151,168),(1048,683,108,48)
    ],wall=21)
    # Continuous lower cast saddle; no unanchored slender straps.
    saddle=gen.poly([(-218,203),(-140,120),(40,71),(220,64),
                     (435,80),(592,125),(580,259),(479,338),
                     (320,356),(160,428),(-49,411),(-215,332)],178)
    support_left=gen.poly([(-355,345),(-285,414),(-178,472),
                           (-112,376),(-130,252),(-268,260)],145)
    support_right=gen.poly([(218,316),(347,377),(487,329),
                            (620,320),(590,200),(380,188)],142)
    body=gen.join(main,secondary,left,right,saddle,support_left,support_right)
    # Re-bore after union to avoid supporting cheeks filling the shafts.
    for c in cutters:body=body.cut(c)
    body=gen.cut_round(body,110,550,(510,195,0))
    # Y-Y: small end counterbores and local machined faces.
    for sgn in [-1,1]:
        body=gen.cut_round(body,121,20,(510,195,sgn*252))
    # Top-view callout Ø75 on the centerline of the long support, located
    # above the primary bearing. Its hole connects into the machined bore.
    body=gen.cut_round(body,37.5,250,(0,594,0),(0,1,0))
    # Longitudinal relief around both channel roots: ribs are inherently
    # built into their U profiles, no arbitrary added decorative strips.
    return body.clean()


def rounded_solid(w,h,d,x,y,z,r):
    solid=gen.box(w,h,d,x,y,z)
    if r>0:
        try:solid=cq.Workplane(obj=solid).edges('|Y').fillet(r).val()
        except Exception as e:print('rounded profile fallback',e)
    return solid


def half_ring(ro,ri,length,x):
    return gen.hollow(ro,ri,length,(x,0,0),(1,0,0)).intersect(gen.box(length+3,430,2*ro+12,x,215,0))


def wing_specs():
    # Two wing flanges visible in E plan are not constant-width straight strips.
    # Hole pitch X positions follow the drawn groups; endpoints/outline curves
    # are reconstructed from the plan where exact dimension chain is absent.
    out=[]
    for sign in [-1,1]:
        path=[(-1020,385),(-1020,446),(-850,480),(-650,520),
              (-380,548),(-245,617),(-178,655),(368,655),
              (485,612),(645,546),(850,498),(1020,466),(1020,382)]
        solid=polyXZ([(x,sign*z) for x,z in path],27,13.5)
        out.append(solid)
    return out


def new_E():
    L,R=2040,410
    shell=gen.hollow(R,R-28,L,(0,0,0),(1,0,0))
    shell=shell.intersect(gen.box(L+10,R+10,2*R+30,0,R/2+5,0))
    # End flange is a two-step hollow semicircular casting, not a thin torus.
    ribs=[half_ring(429,365,32,-1003), half_ring(429,365,32,1003),
          half_ring(418,389,20,-620),half_ring(418,389,20,515)]
    shell=gen.join(shell,*ribs,*wing_specs())
    # E plan top: raised inspection hatch with rounded perimeter and actual
    # opening through shell; nominal plan envelope about 760×580.
    outer=rounded_solid(775,190,598,400,422,0,28)
    cavity=rounded_solid(718,215,542,400,422,0,18)
    frame=outer.cut(cavity)
    shell=gen.join(shell,frame)
    # Open the curved roof beneath the hatch; cut slightly beyond the
    # internal frame walls but do not erase support columns at the edges.
    shell=shell.cut(gen.box(702,370,521,400,515,0))
    # Stepped, rounded top machined sealing land, hollow in its center.
    lip=rounded_solid(815,24,629,400,518,0,32).cut(
        rounded_solid(711,33,537,400,518,0,19))
    shell=gen.join(shell,lip)
    # U-shaped machined saddles in BOTH long sidewalls of the hatch, as visible
    # in the 2027E isometric. These are open semicircles, not extra loop tubes.
    for side in [-1,1]:
        z=side*288
        # reinforce the wall with annular half-rings below the top edge
        ring=gen.hollow(88,68,22,(410,524,z),(0,0,1))
        ring=ring.intersect(gen.box(220,95,28,410,481,z))
        shell=shell.fuse(ring)
    shell=gen.cut_round(shell,68,650,(410,525,0),(0,0,1))
    # Four cast gussets at hatch-wall/arched-housing junction, no floating fins.
    for x in (75,735):
        for side in [-1,1]:
            z=side*228
            cheek=gen.poly([(x-24,308),(x+24,308),(x+28,442),(x-6,470)],50,z)
            shell=shell.fuse(cheek)
    # Small machined observation seat on the other end of the arch (truly open).
    shell=shell.fuse(gen.hollow(76,40,87,(-630,413,0),(0,1,0)))
    shell=gen.cut_round(shell,40,180,(-630,401,0),(0,1,0))
    # Sloped auxiliary port: the opposite D detail also shows a secondary seat.
    # Position is inferred from ISO; machining specification remains unconfirmed.
    axis=(0,.78,.625)
    shell=shell.fuse(gen.hollow(49,25,60,(717,354,218),axis))
    shell=gen.cut_round(shell,25,106,(717,351,212),axis)
    # Pierced top flange: genuine Ø16 mounting holes.
    for z in [-287,287]:
        for x in [86,215,345,485,615,740]:
            shell=gen.cut_round(shell,8,42,(x,518,z),(0,1,0))
    for x in [52,748]:
        for z in [-135,0,135]:
            shell=gen.cut_round(shell,8,42,(x,518,z),(0,1,0))
    # E plan: left 18-Ø33 with Ø58 spotface; right 10-Ø22 with Ø40 spotface.
    # Pitches without explicit coordinate callouts are proportioned to the
    # original wing plan and declared as estimates in validation metadata.
    left=[-940,-825,-710,-595,-480,-365,-250,-135,-20]
    right=[515,625,735,845,965]
    ext=[(-1020,446),(-850,480),(-650,520),(-380,548),(-245,617),
         (-178,655),(368,655),(485,612),(645,546),(850,498),(1020,466)]
    def wing_edge(x):
        for (x0,z0),(x1,z1) in zip(ext[:-1],ext[1:]):
            if x0<=x<=x1:return z0+(z1-z0)*(x-x0)/(x1-x0)
        return ext[0][1] if x<ext[0][0] else ext[-1][1]
    for sign in [-1,1]:
        for x in left:
            # Spotface has radius 29, so its center is kept >= 39 mm
            # inside the measured/approximated flange edge.
            z=sign*(wing_edge(x)-41)
            shell=gen.cut_round(shell,16.5,52,(x,13.5,z),(0,1,0))
            shell=gen.cut_round(shell,29,5,(x,27,z),(0,1,0))
        for x in right:
            # 20 mm spotface radius, 33 mm inset from wing edge.
            z=sign*(wing_edge(x)-33)
            shell=gen.cut_round(shell,11,52,(x,13.5,z),(0,1,0))
            shell=gen.cut_round(shell,20,5,(x,27,z),(0,1,0))
    # End step sealing land: machine grooves into existing half annular lip.
    for x in [-1015,1015]:
        tool=half_ring(386,381,7,x)
        shell=shell.cut(tool)
    return shell.clean()

BUILDERS={'D':new_D,'E':new_E}

if __name__=='__main__':
    names=sys.argv[1:] or ['D','E']
    report=[]
    for n in names:
        print('building',n,flush=True)
        gen.BUILDERS[n]=BUILDERS[n]
        report.append(gen.build_one(n))
        shape=BUILDERS[n]()
        step_dir=ROOT/'cad_models'/'step_v2.4'; step_dir.mkdir(exist_ok=True,parents=True)
        cq.exporters.export(shape,str(step_dir/f'{n}.step'))
    # Keep full eight-part release manifest intact when building only D/E.
    manifest=ROOT/'public'/'models'/'validation.json'
    records={r['part']:r for r in json.loads(manifest.read_text())} if manifest.exists() else {}
    records.update({r['part']:r for r in report})
    manifest.write_text(json.dumps([records[k] for k in sorted(records)],ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
