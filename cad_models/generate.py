"""Clean, true-solid visual CAD reconstructions of 2027 A-H drawings.

Requires cadquery, trimesh, numpy. Builds booleans in millimetres, validates
OCC solid topology, exports glTF for web and optional STEP for follow-on editing.

These are verified *solid geometry*, not certified manufacturing reproductions:
unnamed cast fillets, hidden channels and some wall thicknesses are inferred.
"""
import cadquery as cq
import numpy as np
import trimesh
import json, math, os, sys, time
import vtk
from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
DEST=ROOT/'public'/'models'; DEST.mkdir(exist_ok=True,parents=True)
GLTF_MESH_TOLERANCE=1.3 # mm tessellation. Sharp edges kept by crease normals

def box(w,h,d,x=0,y=0,z=0):
    return cq.Workplane('XY').box(w,h,d).translate((x,y,z)).val()

def cyl(radius,length,center,axis=(0,0,1)):
    a=cq.Vector(*axis).normalized(); c=cq.Vector(*center); return cq.Solid.makeCylinder(radius,length,c-a*(length/2),a)

def hollow(outer,inner,length,center,axis=(0,0,1)):
    return cyl(outer,length,center,axis).cut(cyl(inner,length+4,center,axis))

def cut_round(shape, radius, length, center, axis=(0,0,1)):
    return shape.cut(cyl(radius,length,center,axis))

def join(*shapes):
    arr=[a for a in shapes if a is not None]
    if not arr: raise ValueError('No CAD solids supplied')
    current=arr[0]
    for i,part in enumerate(arr[1:],1):
        current=current.fuse(part)
    return current.clean()

def poly(points,depth,midz=0):
    return cq.Workplane('XY',origin=(0,0,midz-depth/2)).polyline(points).close().extrude(depth).val()

def holes(shape, centers, radius, length, axis=(0,0,1)):
    for center in centers: shape=cut_round(shape,radius,length,center,axis)
    return shape

def screw_circle(n,pitch,center,axis=(0,0,1),r=8,depth=60,phase=0):
    d=cq.Vector(*axis).normalized()
    basis=cq.Vector(0,1,0) if abs(d.y)<.8 else cq.Vector(1,0,0)
    u=d.cross(basis).normalized();v=d.cross(u).normalized()
    c=cq.Vector(*center)
    return [c+u*(pitch*math.cos(phase+i*2*math.pi/n))+v*(pitch*math.sin(phase+i*2*math.pi/n)) for i in range(n)]

def flange(outer,inner,thick,center,axis=(0,0,1),bolts=0,pitch=0,bolt_r=8,phase=0):
    f=hollow(outer,inner,thick,center,axis)
    if bolts:
        for p in screw_circle(bolts,pitch,center,axis,bolt_r,thick+15,phase):
            f=cut_round(f,bolt_r,thick+16,p.toTuple(),axis)
    return f

def cut_holes_separately(shape, hole_specs):
    """Cuts bores from a list of (diameter, depth, center, axis) callouts.
    All dimensions are millimetres. This models nominal pilot bores for tapped
    features, not physical helical threads; avoids false decorative geometry.
    """
    for diameter,depth,center,axis in hole_specs:
        shape=cut_round(shape,diameter/2,depth,center,axis)
    return shape.clean()

def slot_rounded(width,length,thick,center,axis='xy'):
    """Capsule slot cutter, long axis Y of XY plane. Used only where slots
    are visible and the pitch placement has been checked against drawings.
    """
    span=length-width
    if span<=0:raise ValueError('Slot length must exceed width')
    shape=box(width,span,thick,0,0,0)
    shape=shape.fuse(cyl(width/2,thick,(0,span/2,0)))
    shape=shape.fuse(cyl(width/2,thick,(0,-span/2,0)))
    return shape.clean().translate(cq.Vector(*center))

def build_A():
    """Rotary worktable: open radial windows, concentric shoulders, actual through holes."""
    # All in XY plane, Z is worktable axle; overall 1640 OD.
    rings=[hollow(820,770,44,(0,0,82)), hollow(782,730,90,(0,0,18)),
           hollow(640,585,95,(0,0,-6)),hollow(325,245,165,(0,0,-2))]
    ribs=[]
    for i in range(12):
        a=i*math.tau/12; r0=280;r1=755
        beam=box(r1-r0,55,74,(r0+r1)/2,0,-5)
        # rotate around Z; webs are true solids, not overlapping faces
        ribs.append(beam.rotate((0,0,0),(0,0,1),a*180/math.pi))
    # Intermediate machined annular deck shown in A-A and bottom plan. It joins
    # the radial ribs (not a fake top cap closing all the windows).
    rings.append(hollow(727,640,22,(0,0,38)))
    a=join(*(rings+ribs))
    # Eight radial-plan obround windows on the inner annular machining deck.
    # Their centre layout is proportional to the plan: local slot widths are
    # NOT fully dimensioned and are marked as approximate in the manifest.
    for i in range(8):
        phi=i*math.tau/8
        cutter=slot_rounded(27,74,34,(0,0,0))
        cutter=cutter.rotate((0,0,0),(0,0,1),phi*180/math.pi)
        cutter=cutter.translate(cq.Vector(686*math.cos(phi),686*math.sin(phi),38))
        a=a.cut(cutter)
    # Uniform bolt holes go through the top annular deck, no floating bolt heads.
    pts=[(796*math.cos(t),796*math.sin(t),80) for t in [i*math.tau/24 for i in range(24)]]
    a=holes(a,pts,7.0,85)
    # Four hub mounting holes; the plan calls out four M24 positions.
    a=holes(a,[(290*math.cos(i*math.pi/2),290*math.sin(i*math.pi/2),53)
               for i in range(4)],10.3,60)
    return a.rotate((0,0,0),(1,0,0),-90)

def build_B():
    """Main spindle bearing and diagonal support, not a solid rectangular cage."""
    # x horizontal, y vertical, z is bearing axis; base 375 x 430 footprint.
    base=box(375,26,430,0,13,0)
    profile=[(-174,26),(174,26),(174,100),(108,265),(130,331),(94,408),
             (2,415),(-45,376),(-165,335),(-174,300)]
    plates=[]
    for z in [-150,150]:
        panel=poly(profile,20,z)
        # hole in panel overlaps main bearing, cut through plate
        panel=cut_round(panel,95,30,(53,283,z),(0,0,1))
        plates.append(panel)
    hub=hollow(129,95,380,(53,283,0))
    b=join(base,*plates,hub)
    # Remove main bore after union; no internal plate bridging the shaft.
    b=cut_round(b,95,460,(53,283,0))
    for z in [-190,190]:
        b=b.fuse(flange(136,95,18,(53,283,z),(0,0,1),8,117,6,math.pi/8))
    # Base fixing positions, through the base, not bolt cylinders.
    fixing=[(x,13,z) for x in (-143,143) for z in (-164,164)]
    b=holes(b,fixing,11,45,(0,1,0))
    # Re-drill the *assembled* bearing flange: otherwise the sleeve below the
    # flange secretly fills every Ø12 hole even though the flange itself is cut.
    for face_z in (-190,190):
        for pt in screw_circle(8,117,(53,283,face_z),(0,0,1),phase=math.pi/8):
            b=cut_round(b,6,43,pt.toTuple())
    # Further M8/M6 pilot bores visible on the bottom and side installation
    # faces. Their exact pitches are from orthographic proportions, not a
    # certified coordinate dimension.
    b=holes(b,[(x,13,z) for x in (-133,133) for z in (-92,92)],4.2,42,(0,1,0))
    b=holes(b,[(x,y,z) for z in (-150,150)
                   for x,y in [(-128,118),(-70,118),(-128,197),(-70,197)]],3.3,30)
    return b.clean()

def build_C():
    """Cast S-shaped inspection pipe with two R200 bends and Ø315 end flanges.

    Original drawing shows *horizontal, parallel* inlet/outlet centreline
    tangents, centres separated by x=600 and y=440 mm. This is a hollow
    swept solid, NOT a ballooned interpolating tube.
    """
    R=200.0  # TWO dimensioned R200 bends, separated by a 40 mm vertical tangent
    V=cq.Vector
    start=V(0,0,0);pa=V(100,0,0);pb=V(300,200,0)
    pc=V(300,240,0);pd=V(500,440,0);end=V(600,440,0)
    edges=[
        cq.Edge.makeLine(start,pa),
        cq.Edge.makeThreePointArc(pa,V(100+R/math.sqrt(2),200-R/math.sqrt(2),0),pb),
        cq.Edge.makeLine(pb,pc),
        cq.Edge.makeThreePointArc(pc,V(500-R/math.sqrt(2),240+R/math.sqrt(2),0),pd),
        cq.Edge.makeLine(pd,end),
    ]
    path=cq.Wire.assembleEdges(edges)
    outer=cq.Wire.makeCircle(119,start,V(1,0,0))
    inner=cq.Wire.makeCircle(100,start,V(1,0,0))
    pipe=cq.Solid.sweep(outer,[inner],path,makeSolid=True,isFrenet=False)
    # Real machined annular flange with sharp edges and eight THROUGH holes.
    inlet=flange(157.5,100,20,(0,0,0),(1,0,0),8,130,9,math.pi/8)
    outlet=flange(157.5,100,20,(600,440,0),(1,0,0),8,130,9,math.pi/8)
    body=join(pipe,inlet,outlet)
    # Upper-left Ø140 oblique inspection branch; cut internal connection
    # after fusion to prevent a false plugged opening.
    bdir=(-math.sqrt(.5),math.sqrt(.5),0)
    junction=(190,92,0)
    branch=hollow(68,40,185,(160,168,0),bdir)
    lip=flange(70,40,18,(115,213,0),bdir,8,56,5,math.pi/8)
    body=join(body,branch,lip)
    body=cut_round(body,40,265,(154,174,0),bdir)
    # Small vertical threaded inspection neck at the outlet straight.
    body=join(body,hollow(28,16,82,(500,557,0),(0,1,0)),
              flange(39,16,12,(500,593,0),(0,1,0)))
    body=cut_round(body,16,144,(500,536,0),(0,1,0))
    return body.clean()

def build_D():
    """Use the drawing-review reconstruction in rebuild_DE.py."""
    from rebuild_DE import new_D
    return new_D()

def build_E():
    """Use the drawing-review reconstruction in rebuild_DE.py."""
    from rebuild_DE import new_E
    return new_E()

def build_F():
    """A genuinely thin curved support bracket, width 440, not a deep cage."""
    # Outer curved bridge and attachment pads seen in main elevation.
    # Cross section near x=0 is a narrow arch between 80 and 119 height.
    lower=[(-220,15),(-207,0),(-163,0),(-146,28),(-125,40),(-85,60),
           (-38,90),(0,101),(38,90),(85,60),(125,40),(146,28),(163,0),(207,0),(220,15)]
    upper=[(220,36),(208,75),(177,75),(161,114),(136,108),(125,83),
           (70,106),(0,124),(-70,106),(-125,83),(-136,108),(-161,114),(-177,75),(-208,75),(-220,36)]
    f=poly(lower+upper,30,0)
    # Main lower mounting bores into extrusion; full circle through x-y profile.
    # Six machined front holes at the three visible attachment stations on
    # each side, including the lower end holes. Diameter is inferred from
    # the scale where the callout is unclear; not used as a certified bore.
    side_holes=[(-188,28),(-172,57),(-109,68),(109,68),(172,57),(188,28)]
    f=holes(f,[(x,y,0) for x,y in side_holes],10.0,42)
    # Two raised eye supports, the Ø40 holes cut right through their steel.
    for x in (-143,143):
        f=f.fuse(hollow(31,20,105,(x,108,0)))
        f=cut_round(f,20,135,(x,108,0))
    # Two shallow ribs in rear face, not a second 360mm-deep support cage.
    return f.clean()

def build_G():
    """Square-ribbed enclosure enclosing a genuinely hollow axial duct."""
    cy=416
    main=hollow(278,246,870,(0,cy,0))
    for z in [-458,458]:
        main=main.fuse(flange(288,246,28,(0,cy,z),(0,0,1),12,266,8,math.pi/12))
    # Drawing shows an approximately squared front face surrounding the ring,
    # with three ports at the top. True cut-outs pass through both face plates.
    outline=[(-300,0),(300,0),(300,650),(235,940),(-235,940),(-300,650)]
    for z in [-440,440]:
        plate=poly(outline,28,z)
        plate=cut_round(plate,246,46,(0,cy,z))
        for x in [-155,0,155]:
            plate=cut_round(plate,39.5,46,(x,828,z))
        main=main.fuse(plate)
    foot=box(600,32,906,0,16,0)
    # Shallow side beams, not excessively tall disconnected posts.
    for x in [-284,284]:
        main=main.fuse(box(30,650,880,x,347,0))
    g=main.fuse(foot)
    for x in (-155,0,155):
        port=hollow(66,39.5,65,(x,828,447))
        g=g.fuse(port)
        g=cut_round(g,39.5,125,(x,828,445))
        # Repeated small M8 pilot bores in each top interface flange.
        for i in range(6):
            angle=math.tau*i/6
            g=cut_round(g,4.2,24,(x+54*math.cos(angle),828+54*math.sin(angle),475))
    # Front lower service opening with its true annular boss, shown in
    # the side elevation. Exact lower-port centre remains approximate.
    g=g.fuse(hollow(48,30,28,(0,135,443)))
    g=cut_round(g,30,80,(0,135,439))
    # Recut the 12 Ø16 holes through the entire face / flange union, because
    # the adjoining panel otherwise fills part of the bores from behind.
    for face_z in (-458,458):
        for pt in screw_circle(12,266,(0,cy,face_z),(0,0,1),phase=math.pi/12):
            g=cut_round(g,8,75,pt.toTuple())
    return g.clean()

def build_H():
    """540-mm ring flanges, 680 axial, three lower openings and open supports."""
    cy=565
    h=hollow(265,215,662,(0,cy,0))
    for z in [-325,325]:
        h=h.fuse(flange(270,215,30,(0,cy,z),(0,0,1),12,252,9,math.pi/12))
        # Four M16 nominal threaded stations in the front ring, offset from
        # the 12 through holes. For web display the hole is minor-diameter
        # Ø14 pilot, not a rendered helical thread.
        for point in screw_circle(4,236,(0,cy,z),(0,0,1),phase=0):
            h=cut_round(h,7.0,38,point.toTuple())
        # Machined Ø440 counterbore from the Ø430 through-bore and narrow
        # seal-groove near the inner diameter of each flange.
        h=cut_round(h,220,13,(0,cy,z+math.copysign(11,z)))
        h=h.cut(hollow(228,224,5,(0,cy,z+math.copysign(13,z))))
    # Narrow upper/lower axial plates, not closed rectangular cage.
    h=h.fuse(box(470,26,650,0,865,0))
    h=h.fuse(box(420,28,650,0,16,0))
    # The drawing's longitudinal section has slender machined support webs
    # directly beneath the top rail. These connect the rail into the cylinder,
    # avoiding a visually floating plate without introducing inflated lumps.
    for x in (-170,170):
        h=h.fuse(box(16,116,520,x,811,0))
    # Lower side gussets on the front/back end plates -- keep voids below tube.
    gusset=[(-238,28),(-238,240),(-170,332),(-133,290),(-162,90),(-192,28)]
    for z in (-278,278):
        h=h.fuse(poly(gusset,23,z))
        h=h.fuse(poly([(-x,y) for x,y in gusset[::-1]],23,z))
    # Front drilled manifold with 3 actual through holes.
    manifold=box(420,142,26,0,155,322)
    manifold=holes(manifold,[(x,155,322) for x in [-130,0,130]],35.5,50)
    h=h.fuse(manifold)
    # Two cheek blocks bridge the manifold to the cast end support, outside all ports.
    for x in [-196,196]: h=h.fuse(box(28,90,50,x,166,297))
    for x in [-130,0,130]:
        h=h.fuse(hollow(55,35.5,28,(x,155,340)))
        # Drawing: 3 × 6-ST10×1.5 EQS around the three Ø71 ports.
        # Bore approximates the thread pilot Ø8.5; nominal pitch positions
        # are dimensioned in view, angular phase kept symmetric.
        for i in range(6):
            theta=i*math.tau/6
            px=x+47*math.cos(theta);py=155+47*math.sin(theta)
            h=cut_round(h,4.25,25,(px,py,345))
    # Smooth bearing-to-stand transition, kept far outside the central duct.
    for side in [-1,1]:
        h=h.fuse(poly([(side*100,302),(side*174,322),(side*230,240),(side*200,155)],65,0))
    # Top service boss: cut through inner wall and through top plate after union.
    h=h.fuse(hollow(60,31,115,(0,835,0),(0,1,0)))
    h=cut_round(h,31,170,(0,829,0),(0,1,0))
    # 6-M10 (nominal) holes around the top Ø120 service ring, approximated
    # by Ø8.5 pilot bores. They terminate within the roof assembly.
    for pt in screw_circle(6,47,(0,889,0),(0,1,0),phase=math.pi/6):
        h=cut_round(h,4.25,27,pt.toTuple(),(0,1,0))
    # Smaller side service port on right lower support face.
    h=h.fuse(box(90,150,78,220,93,0))
    # The annotated lower auxiliary boss is Ø142 outside / Ø85 bore.
    h=h.fuse(hollow(71,42.5,60,(253,185,0),(1,0,0)))
    h=cut_round(h,42.5,85,(253,185,0),(1,0,0))
    # Six small nominal ST12 pilot holes in the Ø142 auxiliary interface.
    for pt in screw_circle(6,57,(278,185,0),(1,0,0),phase=0):
        h=cut_round(h,5.1,22,pt.toTuple(),(1,0,0))
    # Thin supporting webs attach to the underside of the cylindrical casting.
    # They replace speculative large blocks that looked like inflated lumps.
    for z in [-278,278]:
        for side in [-1,1]:
            web=poly([(side*155,230),(side*205,230),
                      (side*238,470),(side*142,382)],28,z)
            h=h.fuse(web)
    # Slender pier under the lower-left side boss ties the service block to the
    # cast base (otherwise an independent CAD lump remains).
    h=h.fuse(box(22,260,70,-180,145,0))
    # Bottom mounting holes in plate.
    h=holes(h,[(x,16,z) for x in (-180,180) for z in (-280,280)],10,45,(0,1,0))
    # Recut every hole *after* fusion. The long barrel continues beneath the
    # end flange for a few millimetres and would otherwise plug the holes.
    for face_z in (-325,325):
        for pt in screw_circle(12,252,(0,cy,face_z),(0,0,1),phase=math.pi/12):
            h=cut_round(h,9,64,pt.toTuple())
        for pt in screw_circle(4,236,(0,cy,face_z),(0,0,1),phase=0):
            h=cut_round(h,7,52,pt.toTuple())
    return h.clean()

BUILDERS={c:globals()['build_'+c] for c in 'ABCDEFGH'}

def crease_safe_mesh(mesh, angle=36.0):
    """Split vertex normals ONLY along genuine geometric sharp edges.

    The previous global averaged normal across flange-to-cylinder seams caused
    machining edges to look rounded/puffy. This keeps cylindrical patches smooth
    and preserves planar flange and square hatch edges.
    """
    poly=vtk.vtkPolyData()
    points=vtk.vtkPoints()
    points.SetData(numpy_to_vtk(np.ascontiguousarray(mesh.vertices,dtype=np.float32),deep=True))
    poly.SetPoints(points)
    faces=np.column_stack([np.full(len(mesh.faces),3,dtype=np.int64),mesh.faces.astype(np.int64)]).ravel()
    cells=vtk.vtkCellArray()
    cells.SetCells(len(mesh.faces),numpy_to_vtkIdTypeArray(np.ascontiguousarray(faces),deep=True))
    poly.SetPolys(cells)
    # vtkPolyDataNormals intentionally duplicates corner vertices for hard
    # creases, which is normal in GLB and does not change solid CAD geometry.
    n=vtk.vtkPolyDataNormals()
    n.SetInputData(poly)
    n.SetFeatureAngle(angle)
    n.SplittingOn()
    n.ConsistencyOn()
    n.AutoOrientNormalsOn()
    n.ComputePointNormalsOn()
    n.ComputeCellNormalsOff()
    n.NonManifoldTraversalOff()
    n.Update()
    result=n.GetOutput()
    verts=np.asarray(vtk_to_numpy(result.GetPoints().GetData()),dtype=np.float32)
    faceRaw=np.asarray(vtk_to_numpy(result.GetPolys().GetData()),dtype=np.int64)
    if len(faceRaw)%4:raise RuntimeError('Unexpected nontriangle VTK cell data')
    faceIdx=faceRaw.reshape((-1,4))
    if not np.all(faceIdx[:,0]==3):raise RuntimeError('Unexpected nontriangle VTK normals output')
    normals=np.asarray(vtk_to_numpy(result.GetPointData().GetNormals()),dtype=np.float32)
    if len(normals)!=len(verts) or not np.isfinite(normals).all():
        raise RuntimeError('Sharp/smooth normal generation failed')
    baked=trimesh.Trimesh(vertices=verts,faces=faceIdx[:,1:4],
                         vertex_normals=normals,process=False)
    return baked

def export_glb(solid,filename):
    verts,triangles=solid.tessellate(1.3,.105)
    verts=np.array([[v.x,v.y,v.z] for v in verts],dtype=np.float32)
    faces=np.array(triangles,dtype=np.int32)
    if not len(verts) or not len(faces):raise RuntimeError('No tessellation faces')
    mesh=trimesh.Trimesh(vertices=verts,faces=faces,process=False)
    # Watertight check is on the unsplit analytical solid triangulation.
    mesh.merge_vertices(digits_vertex=4)
    if not mesh.is_watertight:
        raise RuntimeError(f'{filename} mesh is open; fix CAD B-rep before publishing')
    if not mesh.is_winding_consistent:
        mesh.fix_normals(multibody=True)
    polished=crease_safe_mesh(mesh,angle=36)
    dest=DEST/(filename+'.glb')
    dest.write_bytes(trimesh.Scene(polished).export(file_type='glb',include_normals=True))
    # Round trip verifies both positions and explicit normals survive export.
    rt=trimesh.load(dest,force='mesh',process=False)
    if not len(rt.faces) or len(rt.vertex_normals)!=len(rt.vertices) or not np.isfinite(rt.vertex_normals).all():
        raise RuntimeError(f'{filename}: invalid GLB round trip')
    return mesh,dest

def build_one(name):
    started=time.time(); obj=BUILDERS[name]()
    # A multi-solid compound may be valid; only nonzero analytic solids are exported.
    if not obj.isValid():raise RuntimeError(name+' CAD shape is invalid')
    if obj.Volume()<1000:raise RuntimeError(name+' negligible CAD volume')
    if len(obj.Solids())!=1:raise RuntimeError(f'{name}: {len(obj.Solids())} disconnected solids (expected 1)')
    b=obj.BoundingBox()
    mesh,dest=export_glb(obj,name)
    rec={'part':name,'volume_mm3':round(obj.Volume()),'solids':len(obj.Solids()),'bounds_mm':[
        [round(b.xmin,1),round(b.xmax,1)],[round(b.ymin,1),round(b.ymax,1)],[round(b.zmin,1),round(b.zmax,1)]],
        'triangles':len(mesh.faces),'gltf_bytes':dest.stat().st_size,
        'cad_valid':obj.isValid(),'watertight_glb':bool(mesh.is_watertight),'sharp_normals_degrees':36,'seconds':round(time.time()-started,1),
        'status':'Single valid CAD B-rep; hard-edge visualization preview; not drawing-complete'}
    print(json.dumps(rec,ensure_ascii=False),flush=True)
    return rec

if __name__=='__main__':
    letters=sys.argv[1:] or list('ABCDEFGH');report=[]
    for name in letters:
        try:report.append(build_one(name))
        except Exception as ex:
            import traceback; traceback.print_exc();print('ERROR',name,str(ex),flush=True)
            if os.environ.get('STRICT_CAD','1')=='1':sys.exit(1)
    # Incremental generation is safe: re-exporting D alone must not erase the
    # metadata of A/B/C/E/F/G/H and break the GitHub Pages prebuild check.
    manifest=DEST/'validation.json'
    previous=json.loads(manifest.read_text()) if manifest.exists() else []
    records={r['part']:r for r in previous}
    records.update({r['part']:r for r in report})
    manifest.write_text(json.dumps([records[k] for k in sorted(records)],
                                   ensure_ascii=False,indent=2)+'\n')
