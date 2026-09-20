using BfresLibrary;
using BfresLibrary.Helpers;
using System.Numerics;
using System.Text.Json;
// Export the bind pose. Smooth-skinned positions are already in model space.
var file = new ResFile(args[0]);
var output = new List<object>();
foreach (var model in file.Models.Values) {
    var bones = model.Skeleton.Bones.Values.ToArray();
    var matrices = new Dictionary<int, Matrix4x4>();
    Matrix4x4 World(int index) {
        if (matrices.TryGetValue(index, out var cached)) return cached;
        var b = bones[index];
        var r = b.Rotation;
        var rotation = b.FlagsRotation.ToString().Contains("Euler")
            ? Matrix4x4.CreateRotationX(r.X) * Matrix4x4.CreateRotationY(r.Y) * Matrix4x4.CreateRotationZ(r.Z)
            : Matrix4x4.CreateFromQuaternion(new Quaternion(r.X, r.Y, r.Z, r.W));
        var result = Matrix4x4.CreateScale(b.Scale.X,b.Scale.Y,b.Scale.Z) * rotation * Matrix4x4.CreateTranslation(b.Position.X,b.Position.Y,b.Position.Z);
        if (b.ParentIndex >= 0 && b.ParentIndex < bones.Length) result *= World(b.ParentIndex);
        return matrices[index] = result;
    }
    foreach (var shape in model.Shapes.Values) {
        var helper = new VertexBufferHelper(model.VertexBuffers[shape.VertexBufferIndex],file.ByteOrder);
        var positions = helper["_p0"].Data;
        var transformed = positions.Select((p,i) => {
            var v = new Vector3(p.X,p.Y,p.Z);
            if(shape.VertexSkinCount == 0) v = Vector3.Transform(v, World(shape.BoneIndex));
            if(shape.VertexSkinCount == 1) v = Vector3.Transform(v, World(model.Skeleton.MatrixToBoneList[(int)helper["_i0"].Data[i].X]));
            return new[]{v.X,v.Y,v.Z};
        }).ToArray();
        var mesh=shape.Meshes[0];
        if(mesh.PrimitiveType.ToString()!="Triangles") throw new Exception("Unsupported primitive: "+mesh.PrimitiveType);
        var indices=mesh.GetIndices().Select(x=>(int)x+(int)mesh.FirstVertex).ToArray();
        var material=model.Materials.Values.ElementAt(shape.MaterialIndex);
        output.Add(new{model=model.Name,name=shape.Name,material=material.Name,paintType=material.ShaderAssign.ShaderOptions.ContainsKey("blitz_paint_type")?material.ShaderAssign.ShaderOptions["blitz_paint_type"].ToString():"missing",vertices=transformed,indices,bonePosition=new[]{0,0,0},boneScale=new[]{1,1,1},boneRotation=new[]{0,0,0,1},bindPose=true});
    }
}
File.WriteAllText(args[1],JsonSerializer.Serialize(output));
