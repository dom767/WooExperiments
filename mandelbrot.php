<?php /* Template Name: Mandelbrot Renderer */ ?>
<HTML>
<HEAD>
<STYLE>
* {font-family:verdana;font-size:14;margin:0;padding:0;}
canvas1 {display:block;}
div.MBMenu {position:fixed;padding:0px;border-width:0px;background-color:rgba(0,1,0,0.1);width:420px;height:40px;top:50px;left:50px;color:white;}
.MBMenu2 {position:fixed;font-size:12px;color:#AAA;padding:0px;border-width:0px;background-color:rgba(1,0,1,0.8);width:220px;height:36px;text-align:center;top:41px;right:50px;padding:10px;}
.MBMenuOpt {float:left;border-width:0px;background-color:rgba(1,0,1,0.8);width:105px;height:40px;color:white;text-align:center;line-height:40px;}
.MBMenuOpt:hover {background-color:rgba(255,255,255,0.8);color:black;}
.MBPanel {position:fixed;border-width:0px;padding:10;background-color:rgba(0,0,0,0.5);width:400px;top:90px;left:50px;color:white;}
.MBLabel {padding:2px;width:120px;float:left;}
.MBInput {padding:2px;width:120px;style="text-align:right";}
a {color:#FFF;font-size:16px;text-decoration:none;}
a:hover {color:#F93;}
</STYLE>

<SCRIPT>

var stop=false;
var gZoom=0.5;
var gPosX=0;
var gPosY=0;
var mandelArray=new Array();
var juliaArray=new Array();
var gWidth = window.innerWidth;
var gHeight = window.innerHeight;
var gSelectingOrbitMode = 0; // continuous
var gSelectingOrbit = false;
var gOrbitX = 0;
var gOrbiyY = 0;

// progressive renderer
var gComplete = true;
var gProgressiveIndex = 0;
var gProgressiveLevel = 16;
var gSmoothShading = true;
var gJuliaMode = false;
var gAAEnabled = true;
var gScaleColour = false;
var gMaxIterations = 256;
var gFullScreen = true;
var gCanvasHeight = 720;
var gCanvasWidth = 1024;
var gColourOffset = 0.0;
var gColourMultiplier = 1.0;

//////////////////////////COLOUR///////////////////////////////
function colour(r, g, b)
{
 this.mR = r;
 this.mG = g;
 this.mB = b;
}

//////////////////////////VEC2/////////////////////////////////
function vec2(x, y)
{
 this.mX = x;
 this.mY = y;
}

//////////////////////////COLOURKEYGFRAME///////////////////////////////
function ColourKeyframe(pos, col)
{
 this.mColour = col;
 this.mPosition = pos;
}

//////////////////////////COLOURGRADIENT///////////////////////////////
function ColourGradient()
{
 this.mColourKeyframe = new Array();
 this.mColourKeyframe[0] = new ColourKeyframe(0.0, new colour(0,0,0));
 this.mColourKeyframe[1] = new ColourKeyframe(1.0, new colour(1,1,1));
}

ColourGradient.prototype.AddKeyframe = function()
{
 var position = arguments[0];
 var colour = arguments[1];

 for (i=0; i<this.mColourKeyframe.length; i++)
 {
   var start = this.mColourKeyframe[i].mPosition;
   var end = 1;
   if (i<this.mColourKeyframe.length-1)
   {
    end = this.mColourKeyframe[i+1].mPosition;
   }
  if (position>start && position<=end)
  {
   var numShuffle = this.mColourKeyframe.length - (i+1);
   this.mColourKeyframe[this.mColourKeyframe.length] = this.mColourKeyframe[this.mColourKeyframe.length-1];
   for (j=0; j<numShuffle; j++)
   {
    this.mColourKeyframe[(this.mColourKeyframe.length-1)-j] = this.mColourKeyframe[((this.mColourKeyframe.length-1)-j)-1] 
   }
   this.mColourKeyframe[i+1] = new ColourKeyframe(position, colour);
  }
 }
}

ColourGradient.prototype.GetColour = function()
{
 var position = arguments[0];
 for (i=0; i<this.mColourKeyframe.length; i++)
 {
   var start = this.mColourKeyframe[i].mPosition;
   var end = 1;
   if (i<this.mColourKeyframe.length-1)
   {
    end = this.mColourKeyframe[i+1].mPosition;
   }
  if (position>=start && position<=end)
  {
   var delta = (position-start) / (end-start);
   var r = this.mColourKeyframe[i+1].mColour.mR * delta + this.mColourKeyframe[i].mColour.mR * (1-delta);
   var g = this.mColourKeyframe[i+1].mColour.mG * delta + this.mColourKeyframe[i].mColour.mG * (1-delta);
   var b = this.mColourKeyframe[i+1].mColour.mB * delta + this.mColourKeyframe[i].mColour.mB * (1-delta);
   return new colour(r, g, b);
  }
 }
}

var gColourGradient = new ColourGradient();

function clamp(value, min, max)
{
 if (value<=min) return min;
 if (value>=max) return max;
 return value;
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
  gPosX = parseFloat(urlParams["x"]);
 if (urlParams["y"] != null)
  gPosY = parseFloat(urlParams["y"]);
 if (urlParams["z"] != null)
  gZoom = parseFloat(urlParams["z"]);
 if (urlParams["m"] != null)
  gJuliaMode = (parseInt(urlParams["m"])>0 ? true : false);
 if (urlParams["jx"] != null)
  gJuliaX = parseFloat(urlParams["jx"]);
 if (urlParams["jy"] != null)
  gJuliaY = parseFloat(urlParams["jy"]);
}

function SetPalette(index)
{
 var palette = [[[0,0,0],[0,0.5,1],[1,1,1],[1,0.5,0],[0,0,0],[1,1,1]],
 [[1,1,1],[0,0.5,1],[1,1,1],[1,0.5,0],[1,1,1],[0,0,0]],
 [[1,0,0],[0.8,0.8,0.1],[0.05,0.8,0.5],[0.05,0.1,0.7],[0.05,0.8,0.6],[0,0,0]],
 [[0,0,0],[1,1,1],[0,0,0],[1,1,1],[0,0,0],[1,1,1]],
 [[0,0,0],[0,1,0],[0.3,0.95,1],[0.95,1,0.35],[1,0.2,0],[0,0,0]]];
 
 gColourGradient.mColourKeyframe[0].mColour = new colour(palette[index][0][0], palette[index][0][1], palette[index][0][2])
 gColourGradient.mColourKeyframe[1].mColour = new colour(palette[index][1][0], palette[index][1][1], palette[index][1][2])
 gColourGradient.mColourKeyframe[2].mColour = new colour(palette[index][2][0], palette[index][2][1], palette[index][2][2])
 gColourGradient.mColourKeyframe[3].mColour = new colour(palette[index][3][0], palette[index][3][1], palette[index][3][2])
 gColourGradient.mColourKeyframe[4].mColour = new colour(palette[index][4][0], palette[index][4][1], palette[index][4][2])
 gColourGradient.mColourKeyframe[5].mColour = new colour(palette[index][5][0], palette[index][5][1], palette[index][5][2])
}

function Initialise()
{
 if (!gFullScreen)
 {
  var canvas = document.getElementById('canvas1');
  gWidth = canvas.width;
  gHeight = canvas.height;
 }
 ReadQueryString();
 for (y=0; y<gHeight; y++)
  for (x=0; x<gWidth; x++)
   {
    mandelArray[(x+gWidth*y)]=Math.random()*255.99;
   }
 gColourGradient.AddKeyframe(0.6, new colour(1,0.5,0));
 gColourGradient.AddKeyframe(0.4, new colour(1,1,1));
 gColourGradient.AddKeyframe(0.2, new colour(0,0.5,1));
 gColourGradient.AddKeyframe(0.8, new colour(0,0,0));
 RenderAgain();
 guiSetInitialParams();
 document.getElementById("canvas1").addEventListener("mousedown", canvasMouseDown);
 document.body.addEventListener("mouseup", MouseUp);
 document.addEventListener("keydown", KeyDown);
 document.addEventListener("mouseleave", MouseLeave);
 document.addEventListener("mousemove", MouseMove);
 var canvas = document.getElementById('canvas1');
 canvas.addEventListener("mousewheel", MouseWheel);
 window.addEventListener("resize", ResizeWindow);
 ResizeWindow();
 guiMenuVisibility(false, false, false);
 setTimeout(Tick, 17);
}

function GetRows(progressiveLevel)
{
 switch(progressiveLevel)
 {
  case 16:
   return gHeight;
   break;
  case 8:
   return gHeight;
   break;
  case 4:
   return gHeight/4;
   break;
  case 2:
   return gHeight/16;
   break;
  case 1:
   return gHeight/64;
   break;
  case 0.5:	
   return gHeight/64;
   break;
  case 0.25:	
   return gHeight/64;
   break;
 }
 return gHeight;
}

function DrawOrbit()
{
 var canvas = document.getElementById('orbitCanvas');
 var orbitWidth = canvas.width;
 var orbitHeight = canvas.height;
 if (canvas.getContext)
 {
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,orbitWidth,orbitHeight);

  // create axis
  ctx.strokeStyle = 'rgb(224,224,224)';
  ctx.beginPath();
  ctx.moveTo(0, orbitHeight*0.5);
  ctx.lineTo(orbitWidth,orbitHeight*0.5);
  ctx.stroke();
  ctx.moveTo(orbitWidth*0.5, 0);
  ctx.lineTo(orbitWidth*0.5,orbitHeight);
  ctx.stroke();
  // draw radius 1+2 circle
  ctx.beginPath();
  ctx.arc(orbitWidth*0.5, orbitHeight*0.5, orbitWidth*0.25, 0, 2*Math.PI);
  ctx.stroke();
  
  var orbitPoints = new Array();
  var orbitIndex = 0;

  var mx = gOrbitX;
  var my = gOrbitY;
  var newx = 0;
  var newy = 0;
  if (gJuliaMode) {newx += mx;newy+=my;}
  var oldx = 0;
  var oldy = 0;
  var mag2 = 0;
  orbitPoints[orbitIndex++] = new vec2(newx, newy);	

  for (var i=0; i<gMaxIterations & mag2 < 4; i++)
  {
   oldx = newx;
   oldy = newy;
   newx = oldx * oldx - oldy * oldy + mx;
   newy = 2 * oldx * oldy + my;
   if (gJuliaMode) {newx += gJuliaX-mx;newy+=gJuliaY-my;}
   orbitPoints[orbitIndex++] = new vec2(newx, newy);	
   mag2 = newx*newx + newy*newy;
  }

  for (var i=0; i<orbitIndex; i++)
  {
   ctx.beginPath();
   var col = gColourGradient.GetColour(i/gMaxIterations);
   ctx.strokeStyle = 'rgb('+col.mR*255.99+','+col.mG*255.99+','+col.mB*255.99+')'
   ctx.fillStyle = 'rgb('+col.mR*255.99+','+col.mG*255.99+','+col.mB*255.99+')'
   ctx.arc((orbitWidth*0.5) + (orbitWidth*0.25)*orbitPoints[i].mX, (orbitHeight*0.5) + (orbitWidth*0.25)*orbitPoints[i].mY, 5, 0, Math.PI*2);
   ctx.fill();
   if (i+1<orbitIndex)
   {
    ctx.beginPath();
    ctx.moveTo((orbitWidth*0.5) + (orbitWidth*0.25) * orbitPoints[i].mX, (orbitHeight*0.5) + (orbitWidth*0.25)*orbitPoints[i].mY);
    ctx.lineTo((orbitWidth*0.5) + (orbitWidth*0.25) * orbitPoints[i+1].mX, (orbitHeight*0.5) + (orbitWidth*0.25)*orbitPoints[i+1].mY);
	ctx.stroke();
   }
   
  }
 }
}

function DrawJulia()
{
 var canvas = document.getElementById('pickerCanvas');
 if (canvas.getContext)
 {
  var ctx = canvas.getContext('2d');
  var imageData = ctx.getImageData(0, 0, 400, 300);

  for (y=0; y<300; y++)
   for (x=0; x<400; x++)
   {
    var idx = (x+y*400);
	var m = juliaArray[idx];
    var col = gColourGradient.GetColour(m/gMaxIterations);
	
	imageData.data[4*(x+y*400)] = col.mR*255.99;
    imageData.data[4*(x+y*400)+1] = col.mG*255.99;
    imageData.data[4*(x+y*400)+2] = col.mB*255.99;
    imageData.data[4*(x+y*400)+3] = 255;
    
   }
   ctx.putImageData(imageData,0,0);
 }
}

function CalculateJulia()
{
 var rZoom = 2;
 for (y=0; y<300; y++)
   for (x=0; x<400; x++)
   {
    var mx = rZoom * (x-(400/2)) / (400/2)
    var my = rZoom * (y-(300/2)) / (400/2)
    var newx = mx;
  	var newy = my;
	var oldx = 0;
	var oldy = 0;
	var mag2 = 0;
	
    for (var i=0; i<gMaxIterations & mag2 < 4; i++)
  	{
	 oldx = newx;
	 oldy = newy;
	 newx = oldx * oldx - oldy * oldy + gCanvasX;
	 newy = 2 * oldx * oldy + gCanvasY;
	 mag2 = newx*newx + newy*newy;
	}
	
	var iterations = i;
	juliaArray[x+y*400] = clamp(iterations,0,gMaxIterations);
   }
}

function DrawMandelbrot()
{

 var min=gMaxIterations;
 var max=0;
 if (gScaleColour)
 {
  for (i=0; i<gWidth*gHeight; i++)
  {
   if (mandelArray[i]<min) min=mandelArray[i];
   if (mandelArray[i]>max) max=mandelArray[i];
  }
 }

 var canvas = document.getElementById('canvas1');
 if (canvas.getContext)
 {
  var ctx = canvas.getContext('2d');
  var imageData = ctx.getImageData(0, 0, gWidth, gHeight);

  ctx.clearRect(0,0,gWidth,gHeight);
  
  rows = GetRows(gProgressiveLevel);
 
  for (y=0; y<gHeight; y++)
   for (x=0; x<gWidth; x++)
   {
    var idx = (x+y*gWidth);
	var m = mandelArray[idx];
	if (gScaleColour)
	{
	 m = (mandelArray[idx]-min) * (gMaxIterations/(max-min));
	}
	m = ((m/gMaxIterations + gColourOffset) * gColourMultiplier) % 1.0;
    var col = gColourGradient.GetColour(m);
	
	if (y==Math.floor(rows*gProgressiveIndex) && gProgressiveIndex>1)
	{
	 col = new colour(1,0.5,0);
	}
	
	imageData.data[4*(x+y*gWidth)] = col.mR*255.99;
    imageData.data[4*(x+y*gWidth)+1] = col.mG*255.99;
    imageData.data[4*(x+y*gWidth)+2] = col.mB*255.99;
    imageData.data[4*(x+y*gWidth)+3] = 255;
    
   }
   ctx.putImageData(imageData,0,0);
 }
}

function CalculateMandelbrot(progressiveLevel, progressiveIndex)
{
 var rows=GetRows(progressiveLevel);
 var rZoom = 1 / gZoom;
 var progressive = progressiveLevel>1 ? progressiveLevel : 1;
 var antialias = progressiveLevel<1 ? 1/progressiveLevel : 1;
 for (y=Math.floor(rows*progressiveIndex); y<Math.floor(rows*(progressiveIndex+1)); y+=progressive)
   for (x=0; x<gWidth; x+=progressive)
   {
	var sumIterations = 0;
	for (ay=0; ay<antialias; ay++)
	 for (ax=0; ax<antialias; ax++)
	 {
      var mx = gPosX + rZoom * ((ax*1/antialias)+x-(gWidth/2)) / (gWidth/2)
      var my = gPosY + rZoom * ((ay*1/antialias)+y-(gHeight/2)) / (gWidth/2)
  	  var newx = 0;
  	  var newy = 0;
	  if (gJuliaMode) {newx += mx;newy+=my;}
	  var oldx = 0;
	  var oldy = 0;
	  var mag2 = 0;
	
      for (var i=0; i<gMaxIterations & mag2 < 256*256; i++)
  	  {
	   oldx = newx;
	   oldy = newy;
	   if (gJuliaMode)
	   {
	    newx = oldx * oldx - oldy * oldy + gJuliaX;
		newy = 2 * oldx * oldy + gJuliaY;
	   }
	   else
	   {
	    newx = oldx * oldx - oldy * oldy + mx;
	    newy = 2 * oldx * oldy + my;
  	   }
	   mag2 = newx*newx + newy*newy;
	  }
	
	  var iterations = i;

      if (gSmoothShading && mag2>=256*256)
	  {
	   iterations += 4 - (Math.log(Math.log(Math.sqrt(mag2))) / Math.log(2));
	  }
	   
	  sumIterations += iterations;
	 }
	sumIterations /= (antialias*antialias);
    for (py = 0; py<progressive & y+py<gHeight; py++)
	 for (px=0; px<progressive & x+px<gWidth; px++)
	 {
	  mandelArray[x+px+(gWidth*(y+py))] = clamp(sumIterations, 0, gMaxIterations);
	 }
   }
}

function guiDraw()
{
 RenderAgain();
}

var gDragStartX, gDragStartY;
var gMouseDown = false;
var gJuliaX=0;
var gJuliaY=0;
var gCanvasX=0;
var gCanvasY=0;

function canvasMouseDown(e)
{
 gMouseDown = true;
 var worldX = e.pageX;
 var worldY = e.pageY;
 
 var canvasElement = document.getElementById('canvas1');
 var canvasX = worldX - canvasElement.offsetLeft;
 var canvasY = worldY - canvasElement.offsetTop;

 if (gJuliaMode == false &&
   (document.getElementById("JuliaSelector").hidden == false
   || document.getElementById("OrbitViewer").hidden == false))
 {
  replaceURL();
  gJuliaX = gPosX+(canvasX-gWidth*0.5)/(gWidth*gZoom*0.5);
  gJuliaY = gPosY+(canvasY-gHeight*0.5)/(gWidth*gZoom*0.5);
  gMouseMoved = true;
 }
 
 if (gSelectingOrbitMode==1)
 {
  gOrbitX = gPosX+(canvasX-gWidth*0.5)/(gWidth*gZoom*0.5);
  gOrbitY = gPosY+(canvasY-gHeight*0.5)/(gWidth*gZoom*0.5);
 }

 gDragStartX = canvasX;
 gDragStartY = canvasY;
 console.log("Mouse Down : " + canvasX + ", " + canvasY);
}

function MouseUp(e)
{
 gMouseDown = false;
 var worldX = e.pageX;
 var worldY = e.pageY;
 
 var canvasElement = document.getElementById('canvas1');
 var canvasX = worldX - canvasElement.offsetLeft;
 var canvasY = worldY - canvasElement.offsetTop;

 console.log("Mouse Up : " + canvasX + ", " + canvasY);
}

function MouseMove(e)
{
 var worldX = e.pageX;
 var worldY = e.pageY;
 
 var canvasElement = document.getElementById('canvas1');
 var canvasX = worldX - canvasElement.offsetLeft;
 var canvasY = worldY - canvasElement.offsetTop;

 gCanvasX = gPosX+(canvasX-gWidth*0.5)/(gWidth*gZoom*0.5);
 gCanvasY = gPosY+(canvasY-gHeight*0.5)/(gWidth*gZoom*0.5);
 gMouseMoved = true;

 if (gMouseDown && (gDragStartX!=canvasX || gDragStartY!=canvasY))
 {
  gPosX -= (canvasX - gDragStartX)/((gWidth*gZoom)/2);
  gPosY -= (canvasY - gDragStartY)/((gWidth*gZoom)/2);
  gDragStartX = canvasX;
  gDragStartY = canvasY;
  RenderAgain();
 }
}

function MouseWheel(e)
{
 var delta = Math.sign(event.deltaY);

 var worldX = e.pageX;
 var worldY = e.pageY;
 
 var canvasElement = document.getElementById('canvas1');
 var canvasX = worldX - canvasElement.offsetLeft;
 var canvasY = worldY - canvasElement.offsetTop;

 if (delta>0)
 {// zoom out
  gPosX -= 0.47*(canvasX-(gWidth*0.5))/(gWidth*gZoom);
  gPosY -= 0.47*(canvasY-(gHeight*0.5))/(gWidth*gZoom);
  SetZoom(gZoom / 1.3);
  RenderAgain();
 }
 else
 {// zoom in
  SetZoom(gZoom * 1.3);
  gPosX += (1.3*0.5)*(canvasX-(gWidth*0.5))/(gWidth*gZoom);
  gPosY += (1.3*0.5)*(canvasY-(gHeight*0.5))/(gWidth*gZoom);
  RenderAgain();
 }
  
}

function KeyDown(e)
{
 if (e.shiftKey)
 {
  if (e.keyCode == '38')
  {// up
   SetZoom(gZoom * 1.1);
   RenderAgain();
  }
  if (e.keyCode == '40')
  {// down
   SetZoom(gZoom / 1.1);
   RenderAgain();
  }
 }
 else
 {
  if (e.keyCode == '38')
  {// up
   gPosY -= 0.1/gZoom;
   RenderAgain();
  }
  if (e.keyCode == '40')
  {// down
   gPosY += 0.1/gZoom;
   RenderAgain();
  }
  if (e.keyCode == '37')
  {// left
   gPosX -= 0.1/gZoom;
   RenderAgain();
  }
  if (e.keyCode == '39')
  {// right
   gPosX += 0.1/gZoom;
   RenderAgain();
  }
  if (e.keyCode == '74')
  {
   var guiJuliaMode = document.getElementById('juliaMode');
   gJuliaMode = !gJuliaMode;
   guiJuliaMode.checked = gJuliaMode;
   RenderAgain();
  }
  if (e.keyCode == '49')
  {
   SetPalette(0);
   if (gComplete)
    DrawMandelbrot();
  }
  if (e.keyCode == '50')
  {
   SetPalette(1);
   if (gComplete)
    DrawMandelbrot();
  }
  if (e.keyCode == '51')
  {
   SetPalette(2);
   if (gComplete)
    DrawMandelbrot();
  }
  if (e.keyCode == '52')
  {
   SetPalette(3);
   if (gComplete)
    DrawMandelbrot();
  }
  if (e.keyCode == '53')
  {
   SetPalette(4);
   if (gComplete)
    DrawMandelbrot();
  }
 }
}

function MouseLeave(e)
{
 console.log("Mouse Leave");
 if (gMouseDown)
  MouseUp(e);
}

function SetZoom(zoom)
{
 gZoom = zoom;
}

function ResizeWindow()
{
 console.log("ResizeWindow (width="+window.innerWidth+", height="+window.innerHeight+")");
 if (gFullScreen)
 {
  gWidth = window.innerWidth;
  gHeight = window.innerHeight;
  var canvas = document.getElementById('canvas1');
  canvas.width = gWidth;
  canvas.height = gHeight;
 }
 else
 {
  gWidth = gCanvasWidth;
  gHeight = gCanvasHeight;
  var canvas = document.getElementById('canvas1');
  canvas.width = gWidth;
  canvas.height = gHeight;
 }

 gMouseMoved=true;
 RenderAgain();
}

function guiSetInitialParams()
{
 var guiSmoothShading = document.getElementById('smoothShading');
 guiSmoothShading.checked = gSmoothShading;
 var guiJuliaMode = document.getElementById('juliaMode');
 guiJuliaMode.checked = gJuliaMode;
 var guiAAEnabled = document.getElementById('aaEnabled');
 guiAAEnabled.checked = gAAEnabled;
 var guiScaleColour = document.getElementById('scaleColour');
 guiScaleColour.checked = gScaleColour;
 var guiMaxIterations = document.getElementById('maxIterations');
 guiMaxIterations.value = gMaxIterations;
 var guiFullScreen = document.getElementById('fullScreen');
 guiFullScreen.checked = gFullScreen;
 var guiWidth = document.getElementById('width');
 guiWidth.value = gCanvasWidth;
 var guiHeight = document.getElementById('height');
 guiHeight.value = gCanvasHeight;
 var guiColourOffset = document.getElementById('colourOffset');
 guiColourOffset.value = gColourOffset;
 var guiColourMultiplier = document.getElementById('colourMultiplier');
 guiColourMultiplier.value = gColourMultiplier;
}

function guiReadParameters(resize, rerender)
{
 var guiSmoothShading = document.getElementById('smoothShading');
 gSmoothShading = guiSmoothShading.checked;
 var guiJuliaMode = document.getElementById('juliaMode');
 gJuliaMode = guiJuliaMode.checked;
 var guiAAEnabled = document.getElementById('aaEnabled');
 gAAEnabled = guiAAEnabled.checked;
 var guiScaleColour = document.getElementById('scaleColour');
 gScaleColour = guiScaleColour.checked;
 var guiMaxIterations = document.getElementById('maxIterations');
 gMaxIterations = parseInt(guiMaxIterations.value);
 var guiColourOffset = document.getElementById('colourOffset');
 gColourOffset = parseFloat(guiColourOffset.value);
 var guiColourMultiplier = document.getElementById('colourMultiplier');
 gColourMultiplier = parseFloat(guiColourMultiplier.value);

 if (resize)
 {
 var guiFullScreen = document.getElementById('fullScreen');
 gFullScreen = guiFullScreen.checked;
 var guiWidth = document.getElementById('width');
 gCanvasWidth = guiWidth.value;
 var guiHeight = document.getElementById('height');
 gCanvasHeight = guiHeight.value;
  ResizeWindow();
 }
 else
 {
  if (rerender)
   RenderAgain();
  else
   DrawMandelbrot();
 }
}

function RenderAgain()
{
 gDirty = true;
}

var gMouseMoved = true;
var gJuliaComplete = true;

function DrawLowResolution()
{
 CalculateMandelbrot(16);
 DrawMandelbrot();
}

function UpdateStats()
{
 var statsdiv = document.getElementById('stats');
 statsdiv.innerHTML="Screen Size<BR>Width : "+gWidth+"<BR>Height : "+gHeight+"<BR><BR>Fractal parameters<BR>Mode : ";
 if (gJuliaMode)
  statsdiv.innerHTML+="Julia"
  else
  statsdiv.innerHTML+="Mandelbrot"
 statsdiv.innerHTML+="<BR>X : "+gCanvasX+"<BR>Y : "+gCanvasY+"<BR>Zoom : "+gZoom; 
}

function replaceURL()
{
 if (window.history.replaceState)
 {
  url = window.location.href.split('/').pop().replace(/\#(.*?)$/, '').replace(/\?(.*?)$/, '');
  url = url.split('.');  // separates filename and extension
  window.history.replaceState({}, null, "mandelbrot.html?x="+gPosX+"&y="+gPosY+"&z="+gZoom+"&m="+(gJuliaMode?"1":"0")+"&jx="+gJuliaX+"&jy="+gJuliaY);
 }
}

function Tick()
{
 if (gDirty)
 {
  CalculateMandelbrot(16, 0);
  gProgressiveLevel = 8;
  gProgressiveIndex = 0;
  gDirty=false;
  gComplete=false;
  replaceURL();
 }
 else
 {
  if (!gComplete)
{  CalculateMandelbrot(gProgressiveLevel, gProgressiveIndex);
  switch(gProgressiveLevel)
  {
   case 8:
    gProgressiveIndex++;
	if (gProgressiveIndex>=1) {gProgressiveLevel=4;gProgressiveIndex=0;}
    break;
   case 4:
    gProgressiveIndex++;
	if (gProgressiveIndex>=4) {gProgressiveLevel=2;gProgressiveIndex=0;}
    break;
   case 2:
    gProgressiveIndex++;
	if (gProgressiveIndex>=16) {gProgressiveLevel=1;gProgressiveIndex=0;}
    break;
   case 1:
    gProgressiveIndex++;
	if (gProgressiveIndex>=64) {if (gAAEnabled) {gProgressiveLevel=0.5;gProgressiveIndex=0;} else {gComplete=true;DrawMandelbrot();}}
    break;
   case 0.5:
    gProgressiveIndex++;
	if (gProgressiveIndex>=64) {gProgressiveLevel=0.25;gProgressiveIndex=0;}
    break;
   case 0.25:
    gProgressiveIndex++;
	if (gProgressiveIndex>=64) {gComplete=true;DrawMandelbrot();}
    break;
  }
 }}
 
 if (!gComplete)
  DrawMandelbrot();

 if (document.getElementById("JuliaSelector").hidden == false)
  TickJulia();

 if (document.getElementById("OrbitViewer").hidden == false)
  TickOrbit();

 if (document.getElementById("Settings").hidden == false)
  TickStats();

 setTimeout(Tick, 17);
}

function TickJulia()
{
 if (gMouseMoved)
 {
  var jsdiv = document.getElementById("JuliaStats");
  jsdiv.innerHTML="<BR>Current Mouse Position<BR>Canvas X = "+gCanvasX+"<BR>Canvas Y = "+gCanvasY+"<BR><BR>Click to set Julia params<BR>Julia X = "+gJuliaX+"<BR>Julia Y = "+gJuliaY;
  CalculateJulia();
  gJuliaComplete = true;
  gJuliaDirty = false;
  DrawJulia();
 }
}

function TickOrbit()
{
 if (gMouseMoved)
 {
  if (gSelectingOrbitMode==0)
  {
   gOrbitX = gCanvasX;
   gOrbitY = gCanvasY
  }
  gMouseMoved = false;
  DrawOrbit();
 }
}

function TickStats()
{
 if (gMouseMoved)
 {
  UpdateStats();
  gMouseMoved = false;
 }
}

function guiMenuVisibility(settings, julia, orbit)
{
 document.getElementById("Settings").hidden = !settings;
 document.getElementById("JuliaSelector").hidden = !julia;
 document.getElementById("OrbitViewer").hidden = !orbit;
}

function guiMenuSettings()
{
 guiMenuVisibility(true, false, false);
}

function guiMenuJuliaSelector()
{
 guiMenuVisibility(false, true, false);
}

function guiMenuOrbitViewer()
{
 guiMenuVisibility(false, false, true);
}

function guiMenuHide()
{
 guiMenuVisibility(false, false, false);
}

function guiSelectNewOrbit()
{
 if (gSelectingOrbitMode==0)
 {
  document.getElementById("selectOrbit").textContent = "Select Orbit Mode : On Click";
  gSelectingOrbitMode = 1;
  gSelectingOrbit = true;
 }  
 else
 {
  document.getElementById("selectOrbit").textContent = "Select Orbit Mode : Continuous";
  gSelectingOrbitMode = 0;
  gSelectingOrbit = false;
 }
}

function CreateCanvas(fullwidth, settings, width, height, x, y, zoom)
{
if (fullwidth)
{
document.write('\
<DIV style="float: left;">\
<CANVAS style="canvas1" id="canvas1" width="100%" height="100%" style="border:1px solid #000000;"></canvas>\
</DIV>');
}
else
{
document.write('\
<CANVAS style="canvas1" id="canvas1" width="'+width+'" height="'+height+'" style="border:1px solid #000000;"></canvas>\
');
gFullScreen = false;
}

if (settings)
{
document.write('\
<DIV class="MBMenu">\
<DIV class="MBMenuOpt" onclick="guiMenuSettings()">Settings</DIV>\
<DIV class="MBMenuOpt" onclick="guiMenuJuliaSelector()">Julia Selector</DIV>\
<DIV class="MBMenuOpt" onclick="guiMenuOrbitViewer()">Orbit Viewer</DIV>\
<DIV class="MBMenuOpt" onclick="guiMenuHide()">Hide</DIV>\
</DIV>\
<DIV class="MBMenu2">\
<A href="http://www.woofractal.com/">WOOFRACTAL.COM</A><BR>Understanding Fractals\
</DIV>\
\
<DIV id="Settings" class="MBPanel">\
<DIV id="stats">\
X : 20<BR>\
Y : 714<BR>\
Zoom : 3.1\
</DIV>\
<BR>Settings\
<BR><INPUT id="smoothShading" checked="true" type="checkbox" onchange="guiReadParameters(false, true)"> Smooth Shading</INPUT>\
<BR><INPUT id="juliaMode" type="checkbox" onchange="guiReadParameters(false, true)"> Julia Mode</INPUT>\
<BR><INPUT id="aaEnabled" type="checkbox" onchange="guiReadParameters(false, true)"> aaEnabled</INPUT>\
<BR><INPUT id="scaleColour" type="checkbox" onchange="guiReadParameters(false, false)"> Scale Colour</INPUT>\
<BR><DIV class="MBLabel" >Max Iterations</DIV><INPUT id="maxIterations" class="MBInput" onchange="guiReadParameters(false, false)"/></input>\
<BR><DIV class="MBLabel" >Offset</DIV><INPUT id="colourOffset" class="MBInput" onchange="guiReadParameters(false, false)"/></input>\
<BR><DIV class="MBLabel" >Multiplier</DIV><INPUT id="colourMultiplier" class="MBInput" onchange="guiReadParameters(false, false)"/></input>\
<BR><INPUT id="fullScreen" type="checkbox" onchange="guiReadParameters(true, true)"> Fullscreen</INPUT>\
<BR><DIV class="MBLabel" >Width</DIV><INPUT id="width" class="MBInput" onchange="guiReadParameters(true, true)"/></input>\
<BR><DIV class="MBLabel" >Height</DIV><INPUT id="height" class="MBInput" onchange="guiReadParameters(true, true)"/></input>\
</DIV>\
\
<DIV id="JuliaSelector" class="MBPanel">\
<CANVAS style="canvas1" id="pickerCanvas" width=400 height=300 style="border:1px solid #000000;"></CANVAS>\
<DIV id="JuliaStats">\
</DIV>\
</DIV>\
\
<DIV id="OrbitViewer" class="MBPanel">\
<CANVAS style="canvas1" id="orbitCanvas" width=400 height=300 style="border:1px solid #000000;"></CANVAS>\
<BUTTON id="selectOrbit" onclick="guiSelectNewOrbit()">Select New Orbit : Always</BUTTON>\
</DIV>');
}
gPosX = x;
gPosY = y;
gZoom = zoom;

Initialise();
}

</SCRIPT>

</HEAD>
<BODY id="body">

<script>
CreateCanvas(true, true, 1200, 1000, 0, 0, 0.5);
</script>
</BODY>
</HTML>