<?php /* Template Name: Mandelbulb Renderer */ ?> 
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mandelbulb Viewer - woofractal.com</title>
<style>
body, html {margin:0;padding:0;overflow:hidden;width:100%;height:100%;}
* {font-family:verdana;font-size:14px;margin:0;padding:0;}
canvas1 {display:block;}
div.MBMenu {position:fixed;padding:0;border-width:0;background-color:rgba(0,1,0,0.1);width:520px;height:40px;top:50px;left:50px;color:white;}
.MBMenu2 {position:fixed;font-size:12px;color:#AAA;padding:0;border-width:0;background-color:rgba(1,0,1,0.8);width:220px;height:36px;text-align:center;top:41px;right:50px;padding:10px;}
.MBMenuOpt {float:left;border-width:0;background-color:rgba(1,0,1,0.8);width:130px;height:40px;color:white;text-align:center;line-height:40px;}
.MBMenuOpt:hover {background-color:rgba(255,255,255,0.8);color:black;}
.MBPanel {position:fixed;border-width:0;padding:10;background-color:rgba(0,0,0,0.5);width:500px;top:90px;left:50px;color:white;}
.MBLabel {padding:2px;width:120px;float:left;}
.MBInput {padding:2px;width:120px;style="text-align:right";}
.MBColourInput {padding:0px;width:120px;}
a {color:#FFF;font-size:16px;text-decoration:none;}
a:hover {color:#F93;}

@media only screen and (max-width: 600px) {
    * {font-family:verdana;font-size:10px;margin:0;padding:0;}
	div.MBMenu {width:320px;height:20px;top:25px;left:25px;}
    .MBMenu2 {font-size:8px;width:160px;height:26px;top:auto;bottom:20.5px;right:25px;padding:5px;}
    .MBMenuOpt {width:80px;height:20px;line-height:20px;}
    .MBPanel {width:300px;top:45px;left:25px;}
    .MBLabel, .MBInput, .MBColourInput {padding:1px;width:80px;}
    a {font-size:12px;}
}

@media only screen and (min-width: 601px) and (max-width: 880px) {
    .MBMenu2 {font-size:12px;width:220px;height:36px;top:auto;bottom:41px;right:50px;padding:10px;}
}
</style>
</head>
<body>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script> 
<!--  <script src="three.js"></script>-->
	<script id="vertexShader" type="x-shader/x-vertex">
    void main() {
        gl_Position = vec4(position, 1.0);
    }
</script>

<script id="fragmentShader" type="x-shader/x-fragment">
precision mediump float;

uniform vec2 resolution; // Dimensions of the viewport
uniform float fov;      // Field of view (in radians)
uniform vec3 cameraPosition2;
uniform vec3 cameraTarget;
uniform float baseEpsilonFactor;
uniform float power;
uniform int iterations;
uniform bool depthCheck;
uniform vec2 depthXY;
uniform bool juliaMode;
uniform bool screenSpaceDE;
uniform vec3 juliaStart;
uniform int estimateIterations;
uniform float DEFactor;
uniform bool XOrbitColour;
uniform bool YOrbitColour;
uniform bool ZOrbitColour;
uniform vec3 XBColour;
uniform vec3 YBColour;
uniform vec3 ZBColour;
uniform vec3 XEColour;
uniform vec3 YEColour;
uniform vec3 ZEColour;
uniform bool HSLBlend;
uniform bool sliceFractal;
uniform float sliceHeight;

mat3 constructCameraBasis(vec3 cameraPos, vec3 target, vec3 up) {
    vec3 forward = normalize(cameraPos - target);
    vec3 right = normalize(cross(up, forward));
    vec3 newUp = cross(forward, right);
    return mat3(right, newUp, forward);
}

// Sphere signed distance function
float sphereSDF(vec3 point, vec3 center, float radius) {
    return length(point - center) - radius;
}

float mandelbulbDE(vec3 pos, out vec4 trap) {
    int maxIterations = iterations;
    const float escapeBound = 2.0;

    vec3 z = pos.xzy;

    float dr = 1.0;
    float r = 0.0;
	float theta, phi;
	
	trap = vec4(abs(z),0.0);

    for (int i = 0; i < maxIterations; i++) {
       r = length(z);
        if (r > escapeBound) break;
		
		float theta = atan(z.y / z.x);
		float phi = asin(z.z / r);
        dr = pow(r, power - 1.0) * power * dr + 1.0;

        // Scale and rotate the point
        float zr = pow(r, power);
        theta = theta * power;
        phi = phi * power;

        // Convert back to cartesian coordinates
        z = zr * vec3(cos(theta) * cos(phi), cos(phi) * sin(theta), sin(phi));
		if (juliaMode)
			z += juliaStart;
        else
			z += pos.xzy;
	    trap = vec4(min(trap.xyz, abs(z)), i);
    }

    return 0.5 * log(r) * r / dr;
}

float distanceEstimate(vec3 point, out vec4 trap) {
    return mandelbulbDE(point, trap);
}

vec3 estimateNormal(vec3 point, float eps) {
	vec4 trap;
    float dx = distanceEstimate(point + vec3(eps, 0.0, 0.0), trap) - distanceEstimate(point - vec3(eps, 0.0, 0.0), trap);
    float dy = distanceEstimate(point + vec3(0.0, eps, 0.0), trap) - distanceEstimate(point - vec3(0.0, eps, 0.0), trap);
    float dz = distanceEstimate(point + vec3(0.0, 0.0, eps), trap) - distanceEstimate(point - vec3(0.0, 0.0, eps), trap);
    return normalize(vec3(dx, dy, dz));
}

float softShadow(vec3 ro, vec3 rd, float start, float end) {
    float res = 1.0;
    float t = start;
    for (int i = 0; i < 50; i++) {
		vec4 trap;
        float h = distanceEstimate(ro + rd * t, trap);
        if (h < start*0.5) return 0.0;  // Fully in shadow
        res = min(res, 8.0 * h / t);
        t += h;
        if (t > end) break;
    }
    return res;
}

// Function to convert RGB to HSL
vec3 rgb2hsl(vec3 c) {
    float maxVal = max(c.r, max(c.g, c.b));
    float minVal = min(c.r, min(c.g, c.b));
    float l = (maxVal + minVal) / 2.0;

    if (maxVal == minVal) {
        return vec3(0.0, 0.0, l);
    }

    float d = maxVal - minVal;
    float s = l > 0.5 ? d / (2.0 - maxVal - minVal) : d / (maxVal + minVal);
    float h;

    if (maxVal == c.r) {
        h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxVal == c.g) {
        h = (c.b - c.r) / d + 2.0;
    } else {
        h = (c.r - c.g) / d + 4.0;
    }

    h /= 6.0;

    return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
	if (t < 0.0) t += 1.0;
	if (t > 1.0) t -= 1.0;
	if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
	if (t < 0.5) return q;
	if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
	return p;
}

// Function to convert HSL to RGB
vec3 hsl2rgb(vec3 c) {
    float r, g, b;

    if (c.y == 0.0) {
        r = g = b = c.z; // achromatic
    } else {
        float q = c.z < 0.5 ? c.z * (1.0 + c.y) : c.z + c.y - c.z * c.y;
        float p = 2.0 * c.z - q;


        r = hue2rgb(p, q, c.x + 1.0 / 3.0);
        g = hue2rgb(p, q, c.x);
        b = hue2rgb(p, q, c.x - 1.0 / 3.0);
    }

    return vec3(r, g, b);
}

vec3 GetFractalColour(vec4 trap) {
	vec3 trapColour = vec3(0.0, 0.0, 0.0);
	if (HSLBlend) {
	    vec3 hsl1, hsl2, hsl3;
		if (XOrbitColour)
		{
		 hsl1 = mix(rgb2hsl(XBColour), rgb2hsl(XEColour), trap.x);
		}
		if (YOrbitColour)
		{
		 hsl2 = mix(rgb2hsl(YBColour), rgb2hsl(YEColour), trap.y);
		}
		if (ZOrbitColour)
		{
		 hsl3 = mix(rgb2hsl(ZBColour), rgb2hsl(ZEColour), trap.z);
		}
		vec3 sum = (XOrbitColour?hsl1:vec3(0,0,0)) + 
			(YOrbitColour?hsl2:vec3(0,0,0)) + 
			(ZOrbitColour?hsl3:vec3(0,0,0));
		sum /= (XOrbitColour?1.0:0.0)+(YOrbitColour?1.0:0.0)+(ZOrbitColour?1.0:0.0);
		sum.x = (XOrbitColour?hsl1.x*trap.x:0.0) + 
			(YOrbitColour?hsl2.x*trap.y:0.0) + 
			(ZOrbitColour?hsl3.x*trap.z:0.0);
		sum.x /= (XOrbitColour?trap.x:0.0)+(YOrbitColour?trap.y:0.0)+(ZOrbitColour?trap.z:0.0);
		
		trapColour = clamp(hsl2rgb(sum), 0.0, 1.0);
	}
	else {
		if (XOrbitColour)
		{
		 trapColour += trap.xxx * mix(XBColour, XEColour, trap.x);
		}
		if (YOrbitColour)
		{
		 trapColour += trap.yyy * mix(YBColour, YEColour, trap.y);
		}
		if (ZOrbitColour)
		{
		 trapColour += trap.zzz * mix(ZBColour, ZEColour, trap.z);
		}
		trapColour = clamp(trapColour, 0.0, 1.0);
	}
	return trapColour;
}

void main() {
	if (sliceFractal)
	{
	  vec2 normalizedCoord = (2.0*gl_FragCoord.xy - resolution) / min(resolution.y, resolution.x);
	  vec3 position = vec3(normalizedCoord.x, sliceHeight, normalizedCoord.y);
	  vec4 trap;
	  distanceEstimate(position, trap);
	  vec3 colour = vec3(1,1,1);//GetFractalColour(trap);
	  colour *= trap.w/float(iterations);
	  gl_FragColor = vec4(colour, 1.0);
	  return;
	}

    // 1. Normalize the 2D screen coordinates
    vec2 normalizedCoord = (2.0*gl_FragCoord.xy - resolution) / min(resolution.y, resolution.x);
    if (depthCheck)
	{
	 normalizedCoord = (2.0*depthXY - resolution) / min(resolution.y, resolution.x);
	}
	
//	gl_FragColor = vec4(normalizedCoord.x, normalizedCoord.y, 0, 1);return;
//	gl_FragColor = vec4(((gl_FragCoord.x-resolution.x) / min(resolution.y, resolution.x))*0.5 + 0.5, ((gl_FragCoord.y-resolution.y) / min(resolution.y, resolution.x))*0.5 + 0.5, 0, 1);return;

    // 2. Determine the point on the image plane in the camera space
    float imagePlaneZ = -1.0 / tan(fov * 0.5); // Negative because in most conventions, camera looks towards -Z in its local space.
    vec3 pointOnImagePlane = vec3(normalizedCoord, imagePlaneZ);
    
	// Construct the camera basis
	mat3 camBasis = constructCameraBasis(cameraPosition2, cameraTarget, vec3(0.0, 1.0, 0.0));

	// Transform the ray direction based on the camera basis
	vec3 transformedRayDir = camBasis * pointOnImagePlane;

	// Now, use this transformedRayDir for raymarching
	vec3 rayDirection = normalize(transformedRayDir);

    // 3. Construct the ray
    vec3 rayOrigin = cameraPosition2;
    
    // Raymarching setup
    float t = 0.0; 
    float maxDistance = 100.0;  // Maximum distance to march
    float minDist = 0.003;  // Minimum distance to consider a hit
    vec3 sphereCenter = vec3(0.0, 0.0, -5.0);  // Placing the sphere a bit into the scene
    float sphereRadius = 1.0;

    float epsilon = minDist*baseEpsilonFactor;
	vec4 trap;
		
	// Raymarching loop
    for (int i = 0; i < estimateIterations; i++) {  // Limit the number of iterations
        vec3 currentPoint = rayOrigin + t * rayDirection;
        float distance = distanceEstimate(currentPoint, trap);
		if (screenSpaceDE)
			epsilon = t / resolution.y * baseEpsilonFactor;
        
        if (distance < epsilon) {  // Close enough to consider it a hit
            break;}
        
		t += DEFactor*distance;  // Move along the ray
        if (t > maxDistance) {  // Exit if we've marched too far
            break;
        }
    }

   // Hemispherical ambient lighting
    vec3 skyColor = vec3(0.53, 0.81, 0.98); // Sky blue
    vec3 groundColor = vec3(0.1, 0.3, 0.1); // Black
	
	if (t < maxDistance) {
		vec3 hitPoint = rayOrigin + t * rayDirection;
		if (depthCheck)
		{
		 gl_FragColor = vec4(hitPoint, t);
		 return;
		}
		
		vec3 normal = estimateNormal(hitPoint, epsilon);
		
		// Define a directional light source
		vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0)); // Example light direction
		
		// Calculate Lambertian reflectance
		float lambert = softShadow(hitPoint, lightDir, 2.0*epsilon, 0.3) * max(0.0, dot(normal, lightDir));		
		vec3 ambientColor = mix(groundColor, skyColor, 0.5 + 0.5 * normal.y);
     
		// Combine lambertian and ambient lighting
		vec3 baseColor = vec3(0.8, 0.5, 0.3); 
		vec3 trapColour = GetFractalColour(trap);
		vec3 finalColor = trapColour * (0.5*ambientColor + lambert);
		gl_FragColor = vec4(finalColor, 1.0);
    }
	else {
		if (depthCheck)
		{
			vec3 hitPoint = rayOrigin + 1000.0 * rayDirection;
			gl_FragColor = vec4(hitPoint, -1.0);
			return;
		}
		vec3 ambientColor = mix(groundColor, skyColor, 0.5 + 0.5 * rayDirection.y);
		gl_FragColor = vec4(ambientColor, 1.0);  // No hit, render black
    }
}
</script>

    <script>
	// Create a scene and a camera
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
let isDragging = false;
let isJuliaDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let gRotation = {x: Math.PI/2, y: 0};
let gJuliaRotation = {x: Math.PI/2, y: 0};
let gDistance = 3;
let gJuliaLocation = { x: 0, y: 0, z: 0 };
let gOrbitLocation = { x: 0, y: 0, z: 0 };
let gPower = 8;
let gIterations = 30;
let gDirty = true;
let gJuliaDirty = true;
let gOrbitViewDirty = true;
let gOrbitMapDirty = true;
let gScreenSpaceDE = true;
let gBaseEpsilonFactor = 1.0;
let gEstimateIterations = 1000;
let gDEFactor = 0.5;
let gCameraFrom = { x: 0, y: 0, z: 3};
let gCameraTo = { x: 0, y: 0, z: 0};
let gFOV = Math.PI / 3;
let gSliceHeight = 0.0;
let gXOrbitColour = true;
let gYOrbitColour = true;
let gZOrbitColour = true;
let gXBColour = { r: 0.005, g: 0.0, b: 0.0}
let gYBColour = { r: 0.0, g: 0.005, b: 0.0}
let gZBColour = { r: 0.0, g: 0.0, b: 0.005}
let gXEColour = { r: 1.0, g: 0.0, b: 0.0}
let gYEColour = { r: 0.0, g: 1.0, b: 0.0}
let gZEColour = { r: 0.0, g: 0.0, b: 1.0}
let gHSLBlend = true;
let gJuliaMain = false;
let gJuliaDragSelection = false;
let gURL = "";
let subWindowWidth=500;
let subWindowHeight=300;

function hexToFloat(hex)
{
    let intValue = parseInt(hex, 16);
    return intValue / 255;
}

function parseColour(str)
{
 var vr = hexToFloat(str.substring(0, 2));
 var vg = hexToFloat(str.substring(2, 4));
 var vb = hexToFloat(str.substring(4, 6));
 return { r:vr, g:vg, b:vb};
}

function ReadQueryString()
{
 var urlParams;
 var match, pl= /\+/g, search = /([^&=]+)=?([^&]*)/g;
 var decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); };
 var query  = window.location.search.substring(1);

 urlParams = {};
 while (match = search.exec(query))
  urlParams[decode(match[1])] = decode(match[2]);

 if (urlParams["x"] != null)
 {
  gXBColour = parseColour(urlParams["x"].substring(0, 6));
  gXEColour = parseColour(urlParams["x"].substring(6, 12));
  gXOrbitColour = true;
 }
 if (urlParams["y"] != null)
 {
  gYBColour = parseColour(urlParams["y"].substring(0, 6));
  gYEColour = parseColour(urlParams["y"].substring(6, 12));
  gYOrbitColour = true;
 }
 if (urlParams["z"] != null)
 {
  gZBColour = parseColour(urlParams["z"].substring(0, 6));
  gZEColour = parseColour(urlParams["z"].substring(6, 12));
  gZOrbitColour = true;
 }
 if (urlParams["s"] != null) switch (urlParams["s"])
 {case 'j':guiMenuVisibility(false, true, false, false);break;
  case 'o':guiMenuVisibility(false, false, true, false);break;
  case 'm':guiMenuVisibility(false, false, false, true);break;};
 if (urlParams["jx"]!=null) gJuliaLocation.x = parseFloat(urlParams["jx"]);
 if (urlParams["jy"]!=null) gJuliaLocation.y = parseFloat(urlParams["jy"]);
 if (urlParams["jz"]!=null) gJuliaLocation.z = parseFloat(urlParams["jz"]);
 if (urlParams["ox"]!=null) gOrbitLocation.x = parseFloat(urlParams["ox"]);
 if (urlParams["oy"]!=null) gOrbitLocation.y = parseFloat(urlParams["oy"]);
 if (urlParams["oz"]!=null) gOrbitLocation.z = parseFloat(urlParams["oz"]);
 if (urlParams["p"]!=null) gPower = parseInt(urlParams["p"]);
 if (urlParams["i"]!=null) gIterations = parseInt(urlParams["i"]);
 if (urlParams["rx"]!=null) gRotation.x = parseFloat(urlParams["rx"]);
 if (urlParams["ry"]!=null) gRotation.y = parseFloat(urlParams["ry"]);
 if (urlParams["jrx"]!=null) gJuliaRotation.x = parseFloat(urlParams["jrx"]);
 if (urlParams["jry"]!=null) gJuliaRotation.y = parseFloat(urlParams["jry"]);
 if (urlParams["d"]!=null) gDistance = parseFloat(urlParams["d"]);
 if (urlParams["e"]!=null) gScreenSpaceDE = (urlParams["e"]=='t' ? true : false);
 if (urlParams["f"]!=null) gBaseEpsilonFactor = parseFloat(urlParams["f"]);
 if (urlParams["g"]!=null) gEstimateIterations = parseFloat(urlParams["g"]);
 if (urlParams["h"]!=null) gDEFactor = parseFloat(urlParams["h"]);
 if (urlParams["k"]!=null) gHSLBlend = (urlParams["k"]=='t' ? true : false);
 if (urlParams["l"]!=null) if (urlParams["l"]=='t') guiJuliaToMain();
}

function floatToHex(num)
{
    let intValue = Math.floor(num * 255.99);
    let hexString = intValue.toString(16);
    return hexString.padStart(2, '0');
}

function convertToHex(col)
{
	return floatToHex(col.r)+floatToHex(col.g)+floatToHex(col.b);
}

function replaceURL()
{
 if (window.history.replaceState)
 {
  gURL = "?";
  if (gXOrbitColour) gURL += "x="+convertToHex(gXBColour)+convertToHex(gXEColour)+"&";
  if (gYOrbitColour) gURL += "y="+convertToHex(gYBColour)+convertToHex(gYEColour)+"&";
  if (gZOrbitColour) gURL += "z="+convertToHex(gZBColour)+convertToHex(gZEColour)+"&";
  gURL = gURL+"s="+(document.getElementById("JuliaSelector").hidden==false?"j":
	(document.getElementById("OrbitViewer").hidden==false?"o":
	(document.getElementById("OrbitMap").hidden == false?"m":"d")));
  gURL = gURL+ "&jx="+parseFloat(gJuliaLocation.x)+
	"&jy="+parseFloat(gJuliaLocation.y)+
	"&jz="+parseFloat(gJuliaLocation.z);
  gURL = gURL+ "&ox="+parseFloat(gOrbitLocation.x)+
	"&oy="+parseFloat(gOrbitLocation.y)+
	"&oz="+parseFloat(gOrbitLocation.z);
  gURL = gURL+ "&p="+parseInt(gPower);
  gURL = gURL+ "&i="+parseInt(gIterations);
  gURL = gURL+ "&rx="+parseFloat(gRotation.x)+"&ry="+parseFloat(gRotation.y);
  gURL = gURL+ "&jrx="+parseFloat(gJuliaRotation.x)+"&jry="+parseFloat(gJuliaRotation.y);
  gURL = gURL+ "&d="+parseFloat(gDistance);
  gURL = gURL+ "&e="+(gScreenSpaceDE?"t":"f");
  gURL = gURL+ "&f="+parseFloat(gBaseEpsilonFactor);
  gURL = gURL+ "&g="+parseFloat(gEstimateIterations);
  gURL = gURL+ "&h="+parseFloat(gDEFactor);
  gURL = gURL+ "&k="+(gHSLBlend?"t":"f");
  gURL = gURL+ "&l="+(gJuliaMain?"t":"f");

  url = window.location.href.split('/').pop().replace(/\#(.*?)$/, '').replace(/\?(.*?)$/, '');
  url = url.split('.');  // separates filename and extension
  if (!window.location.origin.includes("file://")) window.history.replaceState({}, null, url[0]+gURL);
 }
}

// Create a WebGL renderer
var renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Shader material
var shaderMaterial = new THREE.ShaderMaterial({
    vertexShader: document.getElementById('vertexShader').textContent,
    fragmentShader: document.getElementById('fragmentShader').textContent,
    uniforms: {
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        fov: { value: Math.PI / 3 },  // You can adjust this value as needed
        cameraTarget: { value: new THREE.Vector3(0.0, 0.0, 0.0) },     // Example values
        cameraPosition2: { value: new THREE.Vector3(0.0, 0.0, 3.0) },  // Example values
		baseEpsilonFactor: {value: 1.0 },
		screenSpaceDE: { value: true },
		power: {value: 8 },
		iterations: {value: 20 },
		depthCheck: { value: false },
		depthXY: { value: new THREE.Vector2(0, 0) },
		juliaMode: { value: false},
		juliaStart: { value: new THREE.Vector3(1.0, 0.0, 0.0) },
		estimateIterations: {value: 1000 },
		DEFactor: {value: 0.5 },
		XOrbitColour: { value : true},
		YOrbitColour: { value : true},
		ZOrbitColour: { value : true},
		XBColour: {value : new THREE.Vector3(0.0, 0.0, 0.0) },
		YBColour: {value : new THREE.Vector3(0.0, 0.0, 0.0) },
		ZBColour: {value : new THREE.Vector3(0.0, 0.0, 0.0) },
		XEColour: {value : new THREE.Vector3(1.0, 0.0, 0.0) },
		YEColour: {value : new THREE.Vector3(0.0, 1.0, 0.0) },
		ZEColour: {value : new THREE.Vector3(0.0, 0.0, 1.0) },
		HSLBlend : {value : true},
		sliceFractal: {value: false},
		sliceHeight: {value: 0.0 }
}});


// Create a mesh with the shader material
var geometry = new THREE.PlaneGeometry(2, 2);
var mesh = new THREE.Mesh(geometry, shaderMaterial);
scene.add(mesh);

// Position the camera
camera.position.z = 1;

function SetUniforms()
{
	shaderMaterial.uniforms.screenSpaceDE.value = gScreenSpaceDE;
	shaderMaterial.uniforms.baseEpsilonFactor.value = gBaseEpsilonFactor;
	shaderMaterial.uniforms.estimateIterations.value = gEstimateIterations;
	shaderMaterial.uniforms.DEFactor.value = gDEFactor;
	shaderMaterial.uniforms.XOrbitColour.value = gXOrbitColour;
	shaderMaterial.uniforms.YOrbitColour.value = gYOrbitColour;
	shaderMaterial.uniforms.ZOrbitColour.value = gZOrbitColour;
	shaderMaterial.uniforms.HSLBlend.value = gHSLBlend;
	shaderMaterial.uniforms.XBColour.value.set(gXBColour.r, gXBColour.g, gXBColour.b);
	shaderMaterial.uniforms.YBColour.value.set(gYBColour.r, gYBColour.g, gYBColour.b);
	shaderMaterial.uniforms.ZBColour.value.set(gZBColour.r, gZBColour.g, gZBColour.b);
	shaderMaterial.uniforms.XEColour.value.set(gXEColour.r, gXEColour.g, gXEColour.b);
	shaderMaterial.uniforms.YEColour.value.set(gYEColour.r, gYEColour.g, gYEColour.b);
	shaderMaterial.uniforms.ZEColour.value.set(gZEColour.r, gZEColour.g, gZEColour.b);
	shaderMaterial.uniforms.sliceHeight.value = gSliceHeight;
	shaderMaterial.uniforms.juliaStart.value.set(gJuliaLocation.x, gJuliaLocation.y, gJuliaLocation.z);
}

function AnimateJulia() {
	if (gJuliaDirty)
	{
		SetCameraPosition(gJuliaRotation);

		shaderMaterial.uniforms.depthCheck.value = false;
		shaderMaterial.uniforms.juliaMode.value = !gJuliaMain;
		shaderMaterial.uniforms.sliceFractal.value = false;
		shaderMaterial.uniforms.iterations.value = 20;
		shaderMaterial.uniforms.resolution.value.set(subWindowWidth,subWindowHeight);
		SetUniforms();
		shaderMaterial.uniforms.cameraPosition2.value.set(gCameraFrom.x, gCameraFrom.y, gCameraFrom.z);
		shaderMaterial.uniforms.cameraTarget.value.set(gCameraTo.x, gCameraTo.y, gCameraTo.z);
		juliaWindowRenderer.render(scene, camera);
		gJuliaDirty = false;
	}
}

function AnimateOrbitMap() {
	if (gOrbitMapDirty)
	{
		shaderMaterial.uniforms.sliceFractal.value = true;
		shaderMaterial.uniforms.juliaMode.value = gJuliaMain;
		shaderMaterial.uniforms.depthCheck.value = false;
		shaderMaterial.uniforms.iterations.value = 20;
		shaderMaterial.uniforms.resolution.value.set(subWindowWidth,subWindowHeight);
		SetUniforms();
		orbitMapWindowRenderer.render(scene, camera);
		gOrbitMapDirty = false;
	}
}

function interpolateColors(value, color1, color2) {
    // Ensure the value is clamped between 0 and 1
    value = Math.max(0, Math.min(1, value));

    const colorStart = new THREE.Color(color1);
    const colorEnd = new THREE.Color(color2);

    const resultColor = colorStart.clone().lerp(colorEnd, value);
    return resultColor;
}

function AnimateOrbitViewer() {
	if (gOrbitViewDirty)
	{
		if (gOrbitLocation.x!=0.0 || gOrbitLocation.y!=0.0 || gOrbitLocation.z!=0.0)
		{
			points = new Array();
			
			let r;
			const escapeBound = 2.0; // Assuming a common escape bound; adjust if needed
			const juliaMode = false; // Set this based on your needs
			let z = new THREE.Vector3(gOrbitLocation.x, gOrbitLocation.z, gOrbitLocation.y);

			for (var i=0; i<gIterations; i++)
			{
				points[i] = new THREE.Vector3(z.x, z.z, z.y);
				r = z.length();
				if (r > escapeBound) break;

				let theta = Math.atan2(z.y, z.x);  // Note: In JavaScript, atan2(y, x) is the order
				let phi = Math.asin(z.z / r);

				// Scale and rotate the point
				let zr = Math.pow(r, gPower);
				theta = theta * gPower;
				phi = phi * gPower;
				// Convert back to cartesian coordinates
				z.set(
					zr * Math.cos(theta) * Math.cos(phi),
					zr * Math.cos(phi) * Math.sin(theta),
					zr * Math.sin(phi)
				);
				
				if (gJuliaMain)
					z.add(gJuliaLocation);
				else
					z.add(new THREE.Vector3(gOrbitLocation.x, gOrbitLocation.z, gOrbitLocation.y));
			}
			
			while (orbitViewScene.children.length>1)
			{
			 orbitViewScene.remove(orbitViewScene.children[1]);
			}
			
			// create the line object
			const geometry = new THREE.BufferGeometry();
			const vertices = new Float32Array(points.length*3);
			for (i=0; i<points.length; i++)
			{
				vertices[3*i] = points[i].x;
				vertices[3*i+1] = points[i].y;
				vertices[3*i+2] = points[i].z;
			}
			geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
			var colours = new Float32Array(points.length*3);
			for (i=0; i<points.length; i++)
			{
			 colours[3*i] = parseFloat(i) / parseFloat(points.length);
			 colours[3*i+1] = parseFloat(i) / parseFloat(points.length); 
			 colours[3*i+2] = parseFloat(i) / parseFloat(points.length);
			}
			geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

			const material = new THREE.LineBasicMaterial({ vertexColors: true });
			const line = new THREE.Line(geometry, material);
			orbitViewScene.add(line);

			for (let i = 0; i < points.length; i ++) {
				const x = points[i].x;
				const y = points[i].y;
				const z = points[i].z;

				// Create the sphere geometry
				const sphereGeometry = new THREE.SphereGeometry(0.05, 8, 8);  // 0.2 is the radius, adjust as needed
				sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
				const startColor = '#ff0000';  // Red
				const endColor = '#0000ff';   // Blue
				const MatColour = interpolateColors(parseFloat(i)/parseFloat(points.length), startColor, endColor);
				sphereMaterial.color.setRGB(MatColour.r, MatColour.g, MatColour.b);

				const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
				sphere.position.set(x, y, z);

				orbitViewScene.add(sphere);
			}
		}

		orbitViewRenderer.render(orbitViewScene, orbitViewCamera);
		gOrbitViewDirty = false;
	}
}

function SetCameraPosition(rotation)
{
	gCameraFrom.x = Math.sin(rotation.x) * Math.cos(rotation.y) * gDistance;
	gCameraFrom.y = Math.sin(rotation.y) * gDistance;
	gCameraFrom.z = Math.cos(rotation.x) * Math.cos(rotation.y) * gDistance;
}

// Render loop
function animate() {
    requestAnimationFrame(animate);
	if (gDirty)
	{
		replaceURL();
		SetCameraPosition(gRotation);
		
		shaderMaterial.uniforms.power.value = gPower;
		shaderMaterial.uniforms.depthCheck.value = false;
		shaderMaterial.uniforms.juliaMode.value = gJuliaMain;
		shaderMaterial.uniforms.sliceFractal.value = false;
		shaderMaterial.uniforms.iterations.value = gIterations;
		shaderMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
		SetUniforms();
		
	
		shaderMaterial.uniforms.cameraPosition2.value.set(gCameraFrom.x, gCameraFrom.y, gCameraFrom.z);
		shaderMaterial.uniforms.cameraTarget.value.set(gCameraTo.x, gCameraTo.y, gCameraTo.z);
		renderer.render(scene, camera);

		gDirty = false;
	}

	if (document.getElementById("JuliaSelector").hidden == false)
		AnimateJulia();

	if (document.getElementById("OrbitViewer").hidden == false)
		AnimateOrbitViewer();

	if (document.getElementById("OrbitMap").hidden == false)
		AnimateOrbitMap();
}

var renderTarget;

function readBackDepth(x, y) {
	if (!renderer.capabilities.isWebGL2
	 && !renderer.extensions.get('OES_texture_float')) 
	{
	 console.warn("missing capability for floating point textures. bummer");
	 return;
	}
	
	renderTarget = new THREE.WebGLRenderTarget(1, 1, {
	    minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBAFormat,
		type: THREE.FloatType});
	
	shaderMaterial.uniforms.depthCheck.value = true;
	shaderMaterial.uniforms.depthXY.value.set(x, window.innerHeight-y);
	shaderMaterial.uniforms.juliaMode.value = gJuliaMain;
	shaderMaterial.uniforms.sliceFractal.value = false;
	shaderMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
	SetUniforms();

	renderer.setRenderTarget(renderTarget);
	renderer.render(scene, camera);
	renderer.setRenderTarget(null);
	
	const pixelBuffer = new Float32Array(4);  // For RGBA values

	renderer.readRenderTargetPixels(renderTarget, 0, 0, 1, 1, pixelBuffer);
	return pixelBuffer;
}

var juliaWindowRenderer;
var orbitViewRenderer;
var orbitViewScene;
var orbitViewCamera;
var orbitMapWindowRenderer;

function ResizeCanvases(width)
{
 if (width<600)
 {
  subWindowWidth=300;
  subWindowHeight=180;
 }
 else
 {
  subWindowWidth=500;
  subWindowHeight=300;
 }  
 
 const subWindowCanvas = document.getElementById('pickerCanvas');
 subWindowCanvas.width = subWindowWidth;
 subWindowCanvas.height = subWindowHeight;
 juliaWindowRenderer.setSize(subWindowCanvas.width, subWindowCanvas.height);

 const orbitMapWindowCanvas = document.getElementById('orbitMapCanvas');
 orbitMapWindowCanvas.width = subWindowWidth;
 orbitMapWindowCanvas.height = subWindowHeight;
 orbitMapWindowRenderer.setSize(orbitMapWindowCanvas.width, orbitMapWindowCanvas.height);

 const orbitViewCanvas = document.getElementById('orbitCanvas');
 orbitViewCanvas.width = subWindowWidth;
 orbitViewCanvas.height = subWindowHeight;
 orbitViewRenderer.setSize(orbitViewCanvas.width, orbitViewCanvas.height);
}
function InitialiseSubWindows()
{
	// initialise julia preview window
	const subWindowCanvas = document.getElementById('pickerCanvas');
	juliaWindowRenderer = new THREE.WebGLRenderer({ canvas: subWindowCanvas });
	juliaWindowRenderer.setSize(subWindowCanvas.width, subWindowCanvas.height);

	// initialise orbit map window
	const orbitMapWindowCanvas = document.getElementById('orbitMapCanvas');
	orbitMapWindowRenderer = new THREE.WebGLRenderer({ canvas: orbitMapWindowCanvas });
	orbitMapWindowRenderer.setSize(orbitMapWindowCanvas.width, orbitMapWindowCanvas.height);

	//initialise orbit view window
	const orbitViewCanvas = document.getElementById('orbitCanvas');
	orbitViewRenderer = new THREE.WebGLRenderer({ canvas: orbitViewCanvas });
	orbitViewRenderer.setSize(orbitViewCanvas.width, orbitViewCanvas.height);
	
	// set up a new camera for the orbit viewer
	orbitViewCamera = new THREE.PerspectiveCamera(75, orbitViewCanvas.width / orbitViewCanvas.height, 0.1, 1000);
    orbitViewCamera.position.set(2, 2, 2);
	orbitViewCamera.lookAt(0, 0, 0);
	orbitViewCamera.updateProjectionMatrix();
	
	// set up the orbit viewer
	orbitViewScene = new THREE.Scene();
	const axesHelper = new THREE.AxesHelper(5);
    orbitViewScene.add(axesHelper);
}

let gRotationDragCamFrom = { x: 0, y: 0, z:0 };
let gRotationDragCamTo = { x: 0, y: 0, z:0 };
let gSphereRadius = 1;
let gDragTheta = 0;
let gDragPhi = 0;
let gDragDistance = 1;
let gDragMultiplier = 1;

function min(a,b)
{
 if (a<b) return a;
 else return b;
}

function DeviceDown(devx, devy)
{
	pixelBuffer = new Float32Array(4);
	pixelBuffer = readBackDepth(devx, devy);

	if (document.getElementById("JuliaSelector").hidden == false && !gJuliaMain)
	{
		if (pixelBuffer[3]>0)
		{
			gJuliaLocation.x = pixelBuffer[0];
			gJuliaLocation.y = pixelBuffer[2];
			gJuliaLocation.z = pixelBuffer[1];
			setGuiValue('JuliaX', gJuliaLocation.x);
			setGuiValue('JuliaY', gJuliaLocation.y);
			setGuiValue('JuliaZ', gJuliaLocation.z);
		}
		gJuliaDirty = true;
		gJuliaDragSelection = !gJuliaDragSelection;
	}

	if (pixelBuffer[3]>0)
	{
		let camTo = new THREE.Vector3(pixelBuffer[0]-gCameraFrom.x, pixelBuffer[1]-gCameraFrom.y, pixelBuffer[2]-gCameraFrom.z);
		gDragDistance = camTo.length();
	}
	
	isDragging = true;
	previousMousePosition = { x: devx, y: devy };
}

function DeviceMove(devx, devy)
{
	if (document.getElementById("OrbitViewer").hidden == false)
	{
		pixelBuffer = new Float32Array(4);
		pixelBuffer = readBackDepth(devx, devy);
		if (pixelBuffer[3]>0)
		{
			gOrbitLocation.x = pixelBuffer[0];
			gOrbitLocation.y = pixelBuffer[1];
			gOrbitLocation.z = pixelBuffer[2];
		}
		gOrbitViewDirty = true;
	}

	if (document.getElementById("OrbitMap").hidden == false)
	{
		pixelBuffer = new Float32Array(4);
		pixelBuffer = readBackDepth(devx, devy);
		if (pixelBuffer[3]>0)
		{
			if (pixelBuffer[1]!=gSliceHeight)
			{
				gSliceHeight = pixelBuffer[1];
				gOrbitMapDirty = true;
			}
		}
	}

	if (gJuliaDragSelection && document.getElementById("JuliaSelector").hidden == false && !gJuliaMain)
	{
		pixelBuffer = new Float32Array(4);
		pixelBuffer = readBackDepth(devx, devy);
		if (pixelBuffer[3]>0)
		{
			gJuliaLocation.x = pixelBuffer[0];
			gJuliaLocation.y = pixelBuffer[2];
			gJuliaLocation.z = pixelBuffer[1];
			setGuiValue('JuliaX', gJuliaLocation.x);
			setGuiValue('JuliaY', gJuliaLocation.y);
			setGuiValue('JuliaZ', gJuliaLocation.z);
		}
		gJuliaDirty = true;
	}

	if (isDragging)
	{
		let deltaX = devx - previousMousePosition.x;
		let deltaY = devy - previousMousePosition.y;
		
		gRotation.x -= gDragMultiplier * gDragDistance * deltaX * 0.001;
		gRotation.y += gDragMultiplier * gDragDistance * deltaY * 0.001;
		if (gRotation.y>Math.PI / 2) gRotation.y = Math.PI/2;
		if (gRotation.y<-Math.PI / 2) gRotation.y = -Math.PI/2;

		// Store the new mouse position for the next frame
		previousMousePosition = { x: devx, y: devy };
		gDirty = true;
	}

	if (isJuliaDragging)
	{
		let deltaX = devx - previousMousePosition.x;
		let deltaY = devy - previousMousePosition.y;
		
		gJuliaRotation.x -= gDragMultiplier * gDragDistance * deltaX * 0.001;
		gJuliaRotation.y += gDragMultiplier * gDragDistance * deltaY * 0.001;
		if (gJuliaRotation.y>Math.PI / 2) gJuliaRotation.y = Math.PI/2;
		if (gJuliaRotation.y<-Math.PI / 2) gJuliaRotation.y = -Math.PI/2;

		// Store the new mouse position for the next frame
		previousMousePosition = { x: devx, y: devy };
		gJuliaDirty = true;
	}
}

function DeviceUp()
{
	isDragging = false;
	isJuliaDragging = false;
}

var gInitialDistance=0;

function SetZoom(zoomMultiple)
{
	var delta = 1;
	var origin = 1;
	pixelBuffer = new Float32Array(4);
	pixelBuffer = readBackDepth(window.innerWidth/2, window.innerHeight/2);
	if (pixelBuffer[3]>0)
	{
		let camTo = new THREE.Vector3(pixelBuffer[0]-gCameraFrom.x, pixelBuffer[1]-gCameraFrom.y, pixelBuffer[2]-gCameraFrom.z);
		delta = camTo.length();
	}
	let camToCentre = new THREE.Vector3(gCameraTo.x - gCameraFrom.x, gCameraTo.y - gCameraFrom.y, gCameraTo.z - gCameraFrom.z);
	origin = camToCentre.length() - delta;
	delta = delta*zoomMultiple;
	
	gDistance = origin+delta;
	gDirty = true;
	gJuliaDirty = true;
}

function AddListeners()
{
	const canvas = renderer.domElement;
    
	canvas.addEventListener('touchstart', function(event) {
        // Prevent default behavior (optional)
        event.preventDefault();
		if (event.touches.length === 1) {
			DeviceDown(event.touches[0].clientX, event.touches[0].clientY);
		}
		if (event.touches.length === 2) {
			DeviceUp();
			var vec1 = new THREE.Vector2(event.touches[0].pageX, event.touches[0].pageY);
			var vec2 = new THREE.Vector2(event.touches[1].pageX, event.touches[1].pageY);
			gInitialDistance = vec1.distanceTo(vec2);
		}
    });

	canvas.addEventListener('mousedown', (event) => {
		DeviceDown(event.clientX, event.clientY);
	});

	const canvasJulia = juliaWindowRenderer.domElement;
	canvasJulia.addEventListener('mousedown', (event) => {
		isJuliaDragging = true;
		previousMousePosition = { x: event.clientX, y: event.clientY };
	});

	document.addEventListener('touchmove', function(event) {
		if (event.touches.length === 1)
		{
			gDragMultiplier = 3;
			DeviceMove(event.touches[0].clientX, event.touches[0].clientY);
		}
		if (event.touches.length === 2) {
			// Prevent default behavior (optional)
			event.preventDefault();

			var vec1 = new THREE.Vector2(event.touches[0].pageX, event.touches[0].pageY);
			var vec2 = new THREE.Vector2(event.touches[1].pageX, event.touches[1].pageY);
			var distance = vec1.distanceTo(vec2);
			if (distance != gInitialDistance)
			{
				SetZoom(gInitialDistance/distance);
				gInitialDistance = distance;
			}
		}
		

    });

	document.addEventListener('mousemove', (event) => {
		gDragMultiplier = 1;
		DeviceMove(event.clientX, event.clientY);
	});

	document.addEventListener('mouseup', () => {
		DeviceUp();
	});

	document.addEventListener('touchend', function(event) {
		if (event.touches.length === 0) {
			DeviceUp();
		}
		if (event.touches.length === 1) {
			DeviceDown(event.touches[0].clientX, event.touches[0].clientY);
		}
    });

	window.addEventListener('wheel', function(event) {
		if (event.deltaY > 0) {
			SetZoom(1.08);
		} else if (event.deltaY < 0) {
			SetZoom(0.94);
		}

		// Prevent default scrolling behavior if necessary
//		event.preventDefault();
	}, false);
}

// Handle window resize

window.addEventListener('resize', function() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

	gDirty=true;

    shaderMaterial.uniforms.resolution.value.set(width, height);
	ResizeCanvases(window.innerWidth);
});

Initialise();

function setGuiBool(id, value)
{
 var guiItem = document.getElementById(id);
 guiItem.checked = value;
}

function setGuiValue(id, value)
{
 var guiItem = document.getElementById(id);
 guiItem.value = value;
}

function setGuiRGB(id, value)
{
 var guiItem = document.getElementById(id);
 let rHex = Math.floor(value.r * 255).toString(16).padStart(2, '0');
 let gHex = Math.floor(value.g * 255).toString(16).padStart(2, '0');
 let bHex = Math.floor(value.b * 255).toString(16).padStart(2, '0');
 guiItem.value = '#'+rHex+gHex+bHex;
}

function guiSetInitialParams()
{
 setGuiValue('power', gPower);
 setGuiValue('iterations', gIterations);
 setGuiBool('ScreenSpaceDE', gScreenSpaceDE);
 setGuiValue('baseEpsilonFactor', gBaseEpsilonFactor);
 setGuiValue('estimateIterations', gEstimateIterations);
 setGuiValue('DEFactor', gDEFactor);
 setGuiBool('xColourEnabled', gXOrbitColour);
 setGuiBool('yColourEnabled', gYOrbitColour);
 setGuiBool('zColourEnabled', gZOrbitColour);
 setGuiRGB('xbColorPicker', gXBColour);
 setGuiRGB('ybColorPicker', gYBColour);
 setGuiRGB('zbColorPicker', gZBColour);
 setGuiRGB('xeColorPicker', gXEColour);
 setGuiRGB('yeColorPicker', gYEColour);
 setGuiRGB('zeColorPicker', gZEColour);
 setGuiBool('HSLBlend', gHSLBlend);
 setGuiValue('JuliaX', gJuliaLocation.x);
 setGuiValue('JuliaY', gJuliaLocation.y);
 setGuiValue('JuliaZ', gJuliaLocation.z);
}

function getGuiBool(id)
{
 var guiItem = document.getElementById(id);
 return guiItem.checked;
}

function getGuiFloat(id)
{
 var guiItem = document.getElementById(id);
 return parseFloat(guiItem.value);
}

function getGuiInt(id)
{
 var guiItem = document.getElementById(id);
 return parseInt(guiItem.value);
}

function getGuiRGB(id)
{
 var guiItem = document.getElementById(id);
 let r = parseInt(guiItem.value.substr(1, 2), 16) / 255.99;
 let g = parseInt(guiItem.value.substr(3, 2), 16) / 255.99;
 let b = parseInt(guiItem.value.substr(5, 2), 16) / 255.99;
 return {r, g, b};
}

function guiReadParameters(resize, rerender)
{
 gPower = getGuiFloat('power');
 gIterations = getGuiInt('iterations');
 gScreenSpaceDE = getGuiBool('ScreenSpaceDE');
 gBaseEpsilonFactor = getGuiFloat('baseEpsilonFactor');
 gEstimateIterations = getGuiInt('estimateIterations');
 gDEFactor = getGuiFloat('DEFactor');
 gXOrbitColour = getGuiBool('xColourEnabled');
 gYOrbitColour = getGuiBool('yColourEnabled');
 gZOrbitColour = getGuiBool('zColourEnabled');
 gXBColour = getGuiRGB('xbColorPicker');
 gYBColour = getGuiRGB('ybColorPicker');
 gZBColour = getGuiRGB('zbColorPicker');
 gXEColour = getGuiRGB('xeColorPicker');
 gYEColour = getGuiRGB('yeColorPicker');
 gZEColour = getGuiRGB('zeColorPicker');
 gHSLBlend = getGuiBool('HSLBlend');
 gJuliaLocation.x = getGuiFloat('JuliaX');
 gJuliaLocation.y = getGuiFloat('JuliaY');
 gJuliaLocation.z = getGuiFloat('JuliaZ');
 if (rerender) gDirty=true;
 replaceURL();
}

function guiMenuVisibility(settings, julia, orbit, orbitMap)
{
 document.getElementById("Settings").hidden = !settings;
 document.getElementById("JuliaSelector").hidden = !julia;
 document.getElementById("OrbitViewer").hidden = !orbit;
 document.getElementById("OrbitMap").hidden = !orbitMap;
}

function guiMenuSettings()
{
 guiMenuVisibility(document.getElementById("Settings").hidden, false, false, false);
}

function guiMenuJuliaSelector()
{
 guiMenuVisibility(false, document.getElementById("JuliaSelector").hidden, false, false);
}

function guiMenuOrbitViewer()
{
 guiMenuVisibility(false, false, document.getElementById("OrbitViewer").hidden, false);
}

function guiMenuOrbitMapViewer()
{
 guiMenuVisibility(false, false, false, document.getElementById("OrbitMap").hidden);
}

function guiCopyURL()
{
	replaceURL();
    let textToCopy = "This is the text to be copied.";
    navigator.clipboard.writeText(gURL).then(function() {
        console.log('Text successfully copied to clipboard!');
    }).catch(function(err) {
        console.error('Unable to copy text to clipboard:', err);
    });
}

function guiJuliaToMain()
{
 gJuliaMain = !gJuliaMain;
 if (gJuliaMain) document.getElementById("juliaRight").textContent = "<======";
 if (!gJuliaMain) document.getElementById("juliaRight").textContent = "======>";
 gDirty=true;
 gJuliaDirty=true;
 gOrbitMapDirty=true;
 gOrbitViewDirty=true;
}

function Initialise()
{
document.write('\
<DIV class="MBMenu">\
<DIV class="MBMenuOpt" onclick="guiMenuSettings()">Settings</DIV>\
<DIV class="MBMenuOpt" onclick="guiMenuJuliaSelector()">Julia Selector</DIV>\
<DIV class="MBMenuOpt" onclick="guiMenuOrbitViewer()">Orbit Viewer</DIV>\
<DIV class="MBMenuOpt" onclick="guiMenuOrbitMapViewer()">Orbit Map</DIV>\
</DIV>\
<DIV class="MBMenu2">\
<A href="http://www.woofractal.com/">WOOFRACTAL.COM</A><BR>Understanding Fractals\
</DIV>\
\
<DIV id="Settings" class="MBPanel">\
<DIV id="stats">\
X : 0<BR>\
Y : 0<BR>\
Zoom : 1\
</DIV>\
<BR>Settings\
<BR><INPUT id="ScreenSpaceDE" checked="true" type="checkbox" onchange="guiReadParameters(false, true)"> Screen Space DE</INPUT>\
<BR><DIV class="MBLabel" >Power</DIV><INPUT id="power" class="MBInput" onchange="guiReadParameters(false, true)"/></input>\
<BR><DIV class="MBLabel" >MB Iterations</DIV><INPUT id="iterations" class="MBInput" onchange="guiReadParameters(false, true)"/></input>\
<BR><DIV class="MBLabel" >Detail Factor</DIV><INPUT id="baseEpsilonFactor" class="MBInput" onchange="guiReadParameters(false, true)"/></input>\
<BR><DIV class="MBLabel" >DE Iterations</DIV><INPUT id="estimateIterations" class="MBInput" onchange="guiReadParameters(false, true)"/></input>\
<BR><DIV class="MBLabel" >DE Factor</DIV><INPUT id="DEFactor" class="MBInput" onchange="guiReadParameters(false, true)"/></input>\
<BR><DIV class="MBLabel" >Julia Location</DIV><INPUT id="JuliaX" class="MBInput" onchange="guiReadParameters(false, true)"/></input><INPUT id="JuliaY" class="MBInput" onchange="guiReadParameters(false, true)"/></input><INPUT id="JuliaZ" class="MBInput" onchange="guiReadParameters(false, true)"/></input>\
<BR><INPUT id="xColourEnabled" type="checkbox" onchange="guiReadParameters(false, true)"> X orbit value</INPUT>\
<BR><DIV class="MBLabel" >Colour Gradient</DIV><input class="MBColourInput" type="color" id="xbColorPicker" value="#ff0000" onchange="guiReadParameters(false, true)"><input class="MBColourInput" type="color" id="xeColorPicker" value="#ff0000" onchange="guiReadParameters(false, true)">\
<BR><INPUT id="yColourEnabled" type="checkbox" onchange="guiReadParameters(false, true)"> Y orbit value</INPUT>\
<BR><DIV class="MBLabel" >Colour Gradient</DIV><input class="MBColourInput" type="color" id="ybColorPicker" value="#ff0000" onchange="guiReadParameters(false, true)"><input class="MBColourInput" type="color" id="yeColorPicker" value="#ff0000" onchange="guiReadParameters(false, true)">\
<BR><INPUT id="zColourEnabled" type="checkbox" onchange="guiReadParameters(false, true)"> Z orbit value</INPUT>\
<BR><DIV class="MBLabel" >Colour Gradient</DIV><input class="MBColourInput" type="color" id="zbColorPicker" value="#ff0000" onchange="guiReadParameters(false, true)"><input class="MBColourInput" type="color" id="zeColorPicker" value="#ff0000" onchange="guiReadParameters(false, true)">\
<BR><INPUT id="HSLBlend" type="checkbox" onchange="guiReadParameters(false, true)"> HSL Blending</INPUT>\
<BR><BUTTON id="copyURL" onclick="guiCopyURL()">Copy URL to Clipboard</BUTTON>\
</DIV>\
\
<DIV id="JuliaSelector" class="MBPanel">\
<CANVAS style="canvas1" id="pickerCanvas" width=500 height=300 style="border:1px solid #000000;"></CANVAS>\
<BUTTON id="juliaRight" onclick="guiJuliaToMain()">======></BUTTON>\
</DIV>\
\
<DIV id="OrbitViewer" class="MBPanel">\
<CANVAS style="canvas1" id="orbitCanvas" width=500 height=300 style="border:1px solid #000000;"></CANVAS>\
</DIV>\
\
<DIV id="OrbitMap" class="MBPanel">\
<CANVAS style="canvas1" id="orbitMapCanvas" width=500 height=300 style="border:1px solid #000000;"></CANVAS>\
</DIV>');

ReadQueryString();
guiSetInitialParams();
guiMenuVisibility(false, false, false, false);
InitialiseSubWindows();
AddListeners();
animate();
ResizeCanvases(window.innerWidth);

}
	</script>
</body>
</html>
