/** The same travelling gust drives stems, leaf clusters and the lawn. Roots stay pinned. */
export const HOME_BREEZE_GLSL = /* glsl */ `
  vec3 kywaiBreeze(vec3 p, vec4 root, float time, float enabled, float flexibility) {
    float h=max(.15,abs(root.w));
    float bend=pow(clamp((p.y-root.y)*(root.w<0.?-1.:1.)/h,0.,1.25),1.45);
    float phase=dot(root.xz,vec2(.31,.19));
    float gust=.80+.30*sin(time*.47-root.x*.12-root.z*.08);
    float sway=(sin(time*1.18+phase)+.28*sin(time*2.67+phase*1.7))*h*.078*gust*bend*flexibility*enabled;
    return vec3(sway*.92,-abs(sway)*.10,sway*.38);
  }
`

export const HOME_PLANT_DECLARATIONS = /* glsl */ `
  uniform float homeWindTime;
  uniform float homeWindEnabled;
  attribute vec4 homePlantRoot;
  attribute float homePlantFlex;
  ${HOME_BREEZE_GLSL}
`

export const HOME_PLANT_TRANSFORM = /* glsl */ `
  vec3 plantWorld=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz;
  vec3 breeze=kywaiBreeze(plantWorld,homePlantRoot,homeWindTime,homeWindEnabled,homePlantFlex);
  // Instance axes are orthogonal: project world displacement back into local coordinates.
  transformed+=vec3(
    dot(breeze,instanceMatrix[0].xyz)/max(.000001,dot(instanceMatrix[0].xyz,instanceMatrix[0].xyz)),
    dot(breeze,instanceMatrix[1].xyz)/max(.000001,dot(instanceMatrix[1].xyz,instanceMatrix[1].xyz)),
    dot(breeze,instanceMatrix[2].xyz)/max(.000001,dot(instanceMatrix[2].xyz,instanceMatrix[2].xyz))
  );
`
