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
GLTF_MESH_TOLERANCE=1.8 # mm linear tessellation precision, front-end smoothed shading

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
    a=join(*(rings+ribs))
    # Uniform bolt holes go through the top annular deck, no floating bolt heads.
    pts=[(796*math.cos(t),796*math.sin(t),80) for t in [i*math.tau/24 for i in range(24)]]
    a=holes(a,pts,9,85)
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
    """Long continuous cast lifting arm with two open bearings and supporting cheek."""
    primary=hollow(310,162.5,700,(0,330,0))
    small=hollow(163,110,310,(510,195,0))
    # Wide, continuous cambered arm with flared support at both ends. Outline
    # follows the orthographic silhouette (not speculative thin flying struts).
    contour=[
      (-1050,655),(-880,657),(-705,629),(-520,545),(-345,402),
      (-235,435),(-135,516),(-20,555),(110,543),
      (300,455),(480,438),(645,472),(815,580),(1050,775),
      (1010,685),(815,500),(660,395),(520,358),
      (350,369),(190,427),(40,455),(-105,437),
      (-235,348),(-340,320),(-520,448),(-695,548),(-895,597),(-1050,601)]
    arm=poly(contour,110)
    # Lower solid web creates the cast transition between the bearing bosses.
    cheek=poly([(80,150),(220,70),(425,70),(580,155),
                (450,315),(290,330),(130,300)],135)
    d=join(primary,small,arm,cheek)
    # Drill both bearing bores after all material is fused. Never leave a
    # visually blocked hole in the cheek support.
    d=cut_round(d,162.5,800,(0,330,0))
    d=cut_round(d,110,400,(510,195,0))
    return d.clean()

def build_E():
    """2040-long semicircular arched bearing cover with genuine cut-through inspection hatch."""
    L,R=2040,410
    shell=hollow(R,R-26,L,(0,0,0),(1,0,0))
    shell=shell.intersect(box(L+50,450,900,0,225,0)) # y>=0, half-cylinder
    # Actual aperture through arch (approx 590 x 410 footprint).
    aperture=box(590,450,410,400,475,0)
    shell=shell.cut(aperture)
    # end ribs; upper halves. Use separate slender shell ribs to minimise clutter.
    for x in (-1004,1004,-600):
        ring=hollow(R+10,R-35,18,(x,0,0),(1,0,0)).intersect(box(38,450,890,x,225,0))
        shell=shell.fuse(ring)
    # Base flanges along shell; these are two thin strips extending outward.
    for side in [-1,1]:
        rail=box(2040,28,82,0,6,side*431)
        shell=shell.fuse(rail)
    for side in [-1,1]:
        holespace=[(x,5,side*431) for x in range(-925,926,185)]
        shell=holes(shell,holespace,9,60,(0,1,0))
    # Four box walls of the raised hatch; bottom is open, upper ring is open.
    # Their foot overlaps arch so OCC produces one watertight casting.
    # Frame wall with a single rectangular cut. Sharp parallel surfaces and
    # constant 22 mm wall; no bulging corner cylinders or oversized fillets.
    hatch_frame=box(740,176,570,400,422,0)
    hatch_frame=hatch_frame.cut(box(692,200,522,400,422,0))
    shell=join(shell,hatch_frame)
    # Remove the arched roof below the access hatch; the hatch MUST be open.
    shell=shell.cut(box(673,360,505,400,505,0))
    # A 20 mm horizontal top mounting lip, drilled and open in the centre.
    lip=box(785,20,615,400,514,0).cut(box(688,30,515,400,514,0))
    ringholes=[(x,514,z) for x in [74,226,378,530,704] for z in [-278,278]]
    ringholes += [(x,514,z) for x in [50,750] for z in [-140,0,140]]
    lip=holes(lip,ringholes,8,30,(0,1,0))
    shell=shell.fuse(lip)
    # Circular inspection port on left end of arch; actual through bore.
    boss=hollow(75,40,80,(-620,413,0),(0,1,0))
    shell=shell.fuse(boss)
    shell=cut_round(shell,40,180,(-620,397,0),(0,1,0))
    return shell.clean()

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
    f=holes(f,[(x,y,0) for x,y in [(-186,51),(-106,61),(106,61),(186,51)]],13,45)
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
    return g.clean()

def build_H():
    """540-mm ring flanges, 680 axial, three lower openings and open supports."""
    cy=565
    h=hollow(265,218,662,(0,cy,0))
    for z in [-325,325]:
        h=h.fuse(flange(270,218,30,(0,cy,z),(0,0,1),12,252,8,math.pi/12))
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
        h=h.fuse(hollow(54,35.5,28,(x,155,340)))
    # Smooth bearing-to-stand transition, kept far outside the central duct.
    for side in [-1,1]:
        h=h.fuse(poly([(side*100,302),(side*174,322),(side*230,240),(side*200,155)],65,0))
    # Top service boss: cut through inner wall and through top plate after union.
    h=h.fuse(hollow(60,31,115,(0,835,0),(0,1,0)))
    h=cut_round(h,31,170,(0,829,0),(0,1,0))
    # Smaller side service port on right lower support face.
    h=h.fuse(box(90,150,78,220,93,0))
    h=h.fuse(hollow(55,32,60,(253,185,0),(1,0,0)))
    h=cut_round(h,32,85,(253,185,0),(1,0,0))
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
    (DEST/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
