from pathlib import Path
import vtk,numpy as np,trimesh,sys
from vtk.util.numpy_support import numpy_to_vtk,numpy_to_vtkIdTypeArray
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parent.parent
out=root/'previews_hard_edges';out.mkdir(exist_ok=True)
for name in sys.argv[1:] or 'ABCDEFGH':
 mesh=trimesh.load(root/'public/models'/f'{name}.glb',force='mesh',process=False)
 poly=vtk.vtkPolyData();p=vtk.vtkPoints();p.SetData(numpy_to_vtk(mesh.vertices.astype(np.float32),deep=True));poly.SetPoints(p)
 cells=vtk.vtkCellArray()
 faces=np.column_stack([np.full(len(mesh.faces),3,dtype=np.int64),mesh.faces.astype(np.int64)]).ravel()
 cells.SetCells(len(mesh.faces),numpy_to_vtkIdTypeArray(faces,deep=True));poly.SetPolys(cells)
 poly.GetPointData().SetNormals(numpy_to_vtk(np.ascontiguousarray(mesh.vertex_normals,dtype=np.float32),deep=True))
 mapper=vtk.vtkPolyDataMapper();mapper.SetInputData(poly)
 actor=vtk.vtkActor();actor.SetMapper(mapper)
 actor.GetProperty().SetColor(.70,.78,.83);actor.GetProperty().SetAmbient(.19);actor.GetProperty().SetDiffuse(.76);actor.GetProperty().SetSpecular(.10);actor.GetProperty().SetSpecularPower(28)
 renderer=vtk.vtkRenderer();renderer.AddActor(actor);renderer.SetBackground(.09,.13,.18)
 renderer.SetTwoSidedLighting(True);renderer.AutomaticLightCreationOff()
 for position,intensity in [((1.2,2.6,1.8),1.2),((-1.3,0.8,-1.7),.64)]:
  light=vtk.vtkLight();light.SetLightTypeToSceneLight();light.SetPosition(*position);light.SetFocalPoint(0,0,0);light.SetIntensity(intensity);renderer.AddLight(light)
 window=vtk.vtkRenderWindow();window.SetOffScreenRendering(1);window.AddRenderer(renderer);window.SetSize(950,760)
 b=mesh.bounds;center=b.mean(axis=0);diam=np.linalg.norm(b[1]-b[0]);
 cam=renderer.GetActiveCamera();cam.SetFocalPoint(*center);cam.SetViewUp(0,1,0)
 cam.SetPosition(*(center+np.array([1.25,.95,1.35])*diam*1.1));cam.SetViewAngle(32)
 renderer.ResetCameraClippingRange();window.Render()
 capture=vtk.vtkWindowToImageFilter();capture.SetInput(window);capture.Update();writer=vtk.vtkPNGWriter();writer.SetFileName(str(out/f'{name}.png'));writer.SetInputConnection(capture.GetOutputPort());writer.Write();window.Finalize()
 print(name,len(mesh.vertices),len(mesh.faces),'saved')
