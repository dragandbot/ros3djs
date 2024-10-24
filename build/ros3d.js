/**
 * @author Russell Toris - rctoris@wpi.edu
 * @author David Gossow - dgossow@willowgarage.com
 */

var ROS3D = ROS3D || {
  REVISION : '0.18.0'
};

// Marker types
ROS3D.MARKER_ARROW = 0;
ROS3D.MARKER_CUBE = 1;
ROS3D.MARKER_SPHERE = 2;
ROS3D.MARKER_CYLINDER = 3;
ROS3D.MARKER_LINE_STRIP = 4;
ROS3D.MARKER_LINE_LIST = 5;
ROS3D.MARKER_CUBE_LIST = 6;
ROS3D.MARKER_SPHERE_LIST = 7;
ROS3D.MARKER_POINTS = 8;
ROS3D.MARKER_TEXT_VIEW_FACING = 9;
ROS3D.MARKER_MESH_RESOURCE = 10;
ROS3D.MARKER_TRIANGLE_LIST = 11;

// Interactive marker feedback types
ROS3D.INTERACTIVE_MARKER_KEEP_ALIVE = 0;
ROS3D.INTERACTIVE_MARKER_POSE_UPDATE = 1;
ROS3D.INTERACTIVE_MARKER_MENU_SELECT = 2;
ROS3D.INTERACTIVE_MARKER_BUTTON_CLICK = 3;
ROS3D.INTERACTIVE_MARKER_MOUSE_DOWN = 4;
ROS3D.INTERACTIVE_MARKER_MOUSE_UP = 5;

// Interactive marker control types
ROS3D.INTERACTIVE_MARKER_NONE = 0;
ROS3D.INTERACTIVE_MARKER_MENU = 1;
ROS3D.INTERACTIVE_MARKER_BUTTON = 2;
ROS3D.INTERACTIVE_MARKER_MOVE_AXIS = 3;
ROS3D.INTERACTIVE_MARKER_MOVE_PLANE = 4;
ROS3D.INTERACTIVE_MARKER_ROTATE_AXIS = 5;
ROS3D.INTERACTIVE_MARKER_MOVE_ROTATE = 6;

// Interactive marker rotation behavior
ROS3D.INTERACTIVE_MARKER_INHERIT = 0;
ROS3D.INTERACTIVE_MARKER_FIXED = 1;
ROS3D.INTERACTIVE_MARKER_VIEW_FACING = 2;

/**
 * Create a THREE material based on the given RGBA values.
 *
 * @param r - the red value
 * @param g - the green value
 * @param b - the blue value
 * @param a - the alpha value
 * @returns the THREE material
 */
ROS3D.makeColorMaterial = function(r, g, b, a) {
  var color = new THREE.Color();
  color.setRGB(r, g, b);
  if (a <= 0.99) {
    return new THREE.MeshBasicMaterial({
      color : color.getHex(),
      opacity : a + 0.1,
      transparent : true,
      depthWrite : true,
      blendSrc : THREE.SrcAlphaFactor,
      blendDst : THREE.OneMinusSrcAlphaFactor,
      blendEquation : THREE.ReverseSubtractEquation,
      blending : THREE.NormalBlending
    });
  } else {
    return new THREE.MeshPhongMaterial({
      color : color.getHex(),
      opacity : a,
      blending : THREE.NormalBlending
    });
  }
};

/**
 * Return the intersection between the mouseray and the plane.
 *
 * @param mouseRay - the mouse ray
 * @param planeOrigin - the origin of the plane
 * @param planeNormal - the normal of the plane
 * @returns the intersection point
 */
ROS3D.intersectPlane = function(mouseRay, planeOrigin, planeNormal) {
  var vector = new THREE.Vector3();
  var intersectPoint = new THREE.Vector3();
  vector.subVectors(planeOrigin, mouseRay.origin);
  var dot = mouseRay.direction.dot(planeNormal);

  // bail if ray and plane are parallel
  if (Math.abs(dot) < mouseRay.precision) {
    return undefined;
  }

  // calc distance to plane
  var scalar = planeNormal.dot(vector) / dot;

  intersectPoint.addVectors(mouseRay.origin, mouseRay.direction.clone().multiplyScalar(scalar));
  return intersectPoint;
};

/**
 * Find the closest point on targetRay to any point on mouseRay. Math taken from
 * http://paulbourke.net/geometry/lineline3d/
 *
 * @param targetRay - the target ray to use
 * @param mouseRay - the mouse ray
 * @param the closest point between the two rays
 */
ROS3D.findClosestPoint = function(targetRay, mouseRay) {
  var v13 = new THREE.Vector3();
  v13.subVectors(targetRay.origin, mouseRay.origin);
  var v43 = mouseRay.direction.clone();
  var v21 = targetRay.direction.clone();
  var d1343 = v13.dot(v43);
  var d4321 = v43.dot(v21);
  var d1321 = v13.dot(v21);
  var d4343 = v43.dot(v43);
  var d2121 = v21.dot(v21);

  var denom = d2121 * d4343 - d4321 * d4321;
  // check within a delta
  if (Math.abs(denom) <= 0.0001) {
    return undefined;
  }
  var numer = d1343 * d4321 - d1321 * d4343;

  var mua = numer / denom;
  return mua;
};

/**
 * Find the closest point between the axis and the mouse.
 *
 * @param axisRay - the ray from the axis
 * @param camera - the camera to project from
 * @param mousePos - the mouse position
 * @returns the closest axis point
 */
ROS3D.closestAxisPoint = function(axisRay, camera, mousePos) {
  // project axis onto screen
  var o = axisRay.origin.clone();
  o.project(camera);
  var o2 = axisRay.direction.clone().add(axisRay.origin);
  o2.project(camera);

  // d is the axis vector in screen space (d = o2-o)
  var d = o2.clone().sub(o);

  // t is the 2d ray param of perpendicular projection of mousePos onto o
  var tmp = new THREE.Vector2();
  // (t = (mousePos - o) * d / (d*d))
  var t = tmp.subVectors(mousePos, o).dot(d) / d.dot(d);

  // mp is the final 2d-projected mouse pos (mp = o + d*t)
  var mp = new THREE.Vector2();
  mp.addVectors(o, d.clone().multiplyScalar(t));

  // go back to 3d by shooting a ray
  var vector = new THREE.Vector3(mp.x, mp.y, 0.5);
  vector.unproject(camera);
  var mpRay = new THREE.Ray(camera.position, vector.sub(camera.position).normalize());

  return ROS3D.findClosestPoint(axisRay, mpRay);
};

/**
 * @author Julius Kammerl - jkammerl@willowgarage.com
 */

/**
 * The DepthCloud object.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * url - the URL of the stream
 *   * streamType (optional) - the stream type: mjpeg or vp8 video (defaults to vp8)
 *   * f (optional) - the camera's focal length (defaults to standard Kinect calibration)
 *   * maxDepthPerTile (optional) - the factor with which we control the desired depth range (defaults to 1.0)
 *   * pointSize (optional) - point size (pixels) for rendered point cloud
 *   * width (optional) - width of the video stream
 *   * height (optional) - height of the video stream
 *   * whiteness (optional) - blends rgb values to white (0..100)
 *   * varianceThreshold (optional) - threshold for variance filter, used for compression artifact removal
 */
ROS3D.DepthCloud = function(options) {
  options = options || {};
  THREE.Object3D.call(this);

  this.url = options.url;
  this.streamType = options.streamType || 'vp8';
  this.f = options.f || 526;
  this.maxDepthPerTile = options.maxDepthPerTile || 1.0;
  this.pointSize = options.pointSize || 3;
  this.width = options.width || 1024;
  this.height = options.height || 1024;
  this.whiteness = options.whiteness || 0;
  this.varianceThreshold = options.varianceThreshold || 0.000016667;

  var metaLoaded = false;

  this.isMjpeg = this.streamType.toLowerCase() === 'mjpeg';

  this.video = document.createElement(this.isMjpeg ? 'img' : 'video');
  this.video.addEventListener(this.isMjpeg ? 'load' : 'loadedmetadata', this.metaLoaded.bind(this), false);

  if (!this.isMjpeg) {
    this.video.loop = true;
  }

  this.video.src = this.url;
  this.video.crossOrigin = 'Anonymous';
  this.video.setAttribute('crossorigin', 'Anonymous');

  // define custom shaders
  this.vertex_shader = [
    'uniform sampler2D map;',
    '',
    'uniform float width;',
    'uniform float height;',
    'uniform float nearClipping, farClipping;',
    '',
    'uniform float pointSize;',
    'uniform float zOffset;',
    '',
    'uniform float focallength;',
    'uniform float maxDepthPerTile;',
    '',
    'varying vec2 vUvP;',
    'varying vec2 colorP;',
    '',
    'varying float depthVariance;',
    'varying float maskVal;',
    '',
    'float sampleDepth(vec2 pos)',
    '  {',
    '    float depth;',
    '    ',
    '    vec2 vUv = vec2( pos.x / (width*2.0), pos.y / (height*2.0)+0.5 );',
    '    vec2 vUv2 = vec2( pos.x / (width*2.0)+0.5, pos.y / (height*2.0)+0.5 );',
    '    ',
    '    vec4 depthColor = texture2D( map, vUv );',
    '    ',
    '    depth = ( depthColor.r + depthColor.g + depthColor.b ) / 3.0 ;',
    '    ',
    '    if (depth>0.99)',
    '    {',
    '      vec4 depthColor2 = texture2D( map, vUv2 );',
    '      float depth2 = ( depthColor2.r + depthColor2.g + depthColor2.b ) / 3.0 ;',
    '      depth = 0.99+depth2;',
    '    }',
    '    ',
    '    return depth;',
    '  }',
    '',
    'float median(float a, float b, float c)',
    '  {',
    '    float r=a;',
    '    ',
    '    if ( (a<b) && (b<c) )',
    '    {',
    '      r = b;',
    '    }',
    '    if ( (a<c) && (c<b) )',
    '    {',
    '      r = c;',
    '    }',
    '    return r;',
    '  }',
    '',
    'float variance(float d1, float d2, float d3, float d4, float d5, float d6, float d7, float d8, float d9)',
    '  {',
    '    float mean = (d1 + d2 + d3 + d4 + d5 + d6 + d7 + d8 + d9) / 9.0;',
    '    float t1 = (d1-mean);',
    '    float t2 = (d2-mean);',
    '    float t3 = (d3-mean);',
    '    float t4 = (d4-mean);',
    '    float t5 = (d5-mean);',
    '    float t6 = (d6-mean);',
    '    float t7 = (d7-mean);',
    '    float t8 = (d8-mean);',
    '    float t9 = (d9-mean);',
    '    float v = (t1*t1+t2*t2+t3*t3+t4*t4+t5*t5+t6*t6+t7*t7+t8*t8+t9*t9)/9.0;',
    '    return v;',
    '  }',
    '',
    'vec2 decodeDepth(vec2 pos)',
    '  {',
    '    vec2 ret;',
    '    ',
    '    ',
    '    float depth1 = sampleDepth(vec2(position.x-1.0, position.y-1.0));',
    '    float depth2 = sampleDepth(vec2(position.x, position.y-1.0));',
    '    float depth3 = sampleDepth(vec2(position.x+1.0, position.y-1.0));',
    '    float depth4 = sampleDepth(vec2(position.x-1.0, position.y));',
    '    float depth5 = sampleDepth(vec2(position.x, position.y));',
    '    float depth6 = sampleDepth(vec2(position.x+1.0, position.y));',
    '    float depth7 = sampleDepth(vec2(position.x-1.0, position.y+1.0));',
    '    float depth8 = sampleDepth(vec2(position.x, position.y+1.0));',
    '    float depth9 = sampleDepth(vec2(position.x+1.0, position.y+1.0));',
    '    ',
    '    float median1 = median(depth1, depth2, depth3);',
    '    float median2 = median(depth4, depth5, depth6);',
    '    float median3 = median(depth7, depth8, depth9);',
    '    ',
    '    ret.x = median(median1, median2, median3);',
    '    ret.y = variance(depth1, depth2, depth3, depth4, depth5, depth6, depth7, depth8, depth9);',
    '    ',
    '    return ret;',
    '    ',
    '  }',
    '',
    '',
    'void main() {',
    '  ',
    '  vUvP = vec2( position.x / (width*2.0), position.y / (height*2.0)+0.5 );',
    '  colorP = vec2( position.x / (width*2.0)+0.5 , position.y / (height*2.0)  );',
    '  ',
    '  vec4 pos = vec4(0.0,0.0,0.0,0.0);',
    '  depthVariance = 0.0;',
    '  ',
    '  if ( (vUvP.x<0.0)|| (vUvP.x>0.5) || (vUvP.y<0.5) || (vUvP.y>0.0))',
    '  {',
    '    vec2 smp = decodeDepth(vec2(position.x, position.y));',
    '    float depth = smp.x;',
    '    depthVariance = smp.y;',
    '    ',
    '    float z = -depth;',
    '    ',
    '    pos = vec4(',
    '      ( position.x / width - 0.5 ) * z * 0.5 * maxDepthPerTile * (1000.0/focallength) * -1.0,',
    '      ( position.y / height - 0.5 ) * z * 0.5 * maxDepthPerTile * (1000.0/focallength),',
    '      (- z + zOffset / 1000.0) * maxDepthPerTile,',
    '      1.0);',
    '    ',
    '    vec2 maskP = vec2( position.x / (width*2.0), position.y / (height*2.0)  );',
    '    vec4 maskColor = texture2D( map, maskP );',
    '    maskVal = ( maskColor.r + maskColor.g + maskColor.b ) / 3.0 ;',
    '  }',
    '  ',
    '  gl_PointSize = pointSize;',
    '  gl_Position = projectionMatrix * modelViewMatrix * pos;',
    '  ',
    '}'
    ].join('\n');

  this.fragment_shader = [
    'uniform sampler2D map;',
    'uniform float varianceThreshold;',
    'uniform float whiteness;',
    '',
    'varying vec2 vUvP;',
    'varying vec2 colorP;',
    '',
    'varying float depthVariance;',
    'varying float maskVal;',
    '',
    '',
    'void main() {',
    '  ',
    '  vec4 color;',
    '  ',
    '  if ( (depthVariance>varianceThreshold) || (maskVal>0.5) ||(vUvP.x<0.0)|| (vUvP.x>0.5) || (vUvP.y<0.5) || (vUvP.y>1.0))',
    '  {  ',
    '    discard;',
    '  }',
    '  else ',
    '  {',
    '    color = texture2D( map, colorP );',
    '    ',
    '    float fader = whiteness /100.0;',
    '    ',
    '    color.r = color.r * (1.0-fader)+ fader;',
    '    ',
    '    color.g = color.g * (1.0-fader)+ fader;',
    '    ',
    '    color.b = color.b * (1.0-fader)+ fader;',
    '    ',
    '    color.a = 1.0;//smoothstep( 20000.0, -20000.0, gl_FragCoord.z / gl_FragCoord.w );',
    '  }',
    '  ',
    '  gl_FragColor = vec4( color.r, color.g, color.b, color.a );',
    '  ',
    '}'
    ].join('\n');
};
ROS3D.DepthCloud.prototype.__proto__ = THREE.Object3D.prototype;

/**
 * Callback called when video metadata is ready
 */
ROS3D.DepthCloud.prototype.metaLoaded = function() {
  this.metaLoaded = true;
  this.initStreamer();
};

/**
 * Callback called when video metadata is ready
 */
ROS3D.DepthCloud.prototype.initStreamer = function() {

  if (this.metaLoaded) {
    this.texture = new THREE.Texture(this.video);
    this.geometry = new THREE.Geometry();

    for (var i = 0, l = this.width * this.height; i < l; i++) {

      var vertex = new THREE.Vector3();
      vertex.x = (i % this.width);
      vertex.y = Math.floor(i / this.width);

      this.geometry.vertices.push(vertex);
    }

    this.material = new THREE.ShaderMaterial({
      uniforms : {
        'map' : {
          type : 't',
          value : this.texture
        },
        'width' : {
          type : 'f',
          value : this.width
        },
        'height' : {
          type : 'f',
          value : this.height
        },
        'focallength' : {
          type : 'f',
          value : this.f
        },
        'pointSize' : {
          type : 'f',
          value : this.pointSize
        },
        'zOffset' : {
          type : 'f',
          value : 0
        },
        'whiteness' : {
          type : 'f',
          value : this.whiteness
        },
        'varianceThreshold' : {
          type : 'f',
          value : this.varianceThreshold
        },
        'maxDepthPerTile': {
          type : 'f',
          value : this.maxDepthPerTile
        },
      },
      vertexShader : this.vertex_shader,
      fragmentShader : this.fragment_shader
    });

    this.mesh = new THREE.ParticleSystem(this.geometry, this.material);
    this.mesh.position.x = 0;
    this.mesh.position.y = 0;
    this.add(this.mesh);

    var that = this;

    setInterval(function() {
      if (that.isMjpeg || that.video.readyState === that.video.HAVE_ENOUGH_DATA) {
        that.texture.needsUpdate = true;
      }
    }, 1000 / 30);
  }
};

/**
 * Start video playback
 */
ROS3D.DepthCloud.prototype.startStream = function() {
  if (!this.isMjpeg) {
    this.video.play();
  }
};

/**
 * Stop video playback
 */
ROS3D.DepthCloud.prototype.stopStream = function() {
  if (!this.isMjpeg) {
    this.video.pause();
  }
};

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * The main interactive marker object.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * handle - the ROS3D.InteractiveMarkerHandle for this marker
 *  * camera - the main camera associated with the viewer for this marker
 *  * path (optional) - the base path to any meshes that will be loaded
 *  * loader (optional) - the Collada loader to use (e.g., an instance of ROS3D.COLLADA_LOADER
 *                        ROS3D.COLLADA_LOADER_2) -- defaults to ROS3D.COLLADA_LOADER_2
 */
ROS3D.InteractiveMarker = function(options) {
  THREE.Object3D.call(this);
  THREE.EventDispatcher.call(this);

  var that = this;
  options = options || {};
  var handle = options.handle;
  this.name = handle.name;
  var camera = options.camera;
  var path = options.path || '/';
  var loader = options.loader || ROS3D.COLLADA_LOADER_2;
  this.dragging = false;

  // set the initial pose
  this.onServerSetPose({
    pose : handle.pose
  });

  // information on where the drag started
  this.dragStart = {
    position : new THREE.Vector3(),
    orientation : new THREE.Quaternion(),
    positionWorld : new THREE.Vector3(),
    orientationWorld : new THREE.Quaternion(),
    event3d : {}
  };

  // add each control message
  handle.controls.forEach(function(controlMessage) {
    that.add(new ROS3D.InteractiveMarkerControl({
      parent : that,
      handle : handle,
      message : controlMessage,
      camera : camera,
      path : path,
      loader : loader
    }));
  });

  // check for any menus
  if (handle.menuEntries.length > 0) {
    this.menu = new ROS3D.InteractiveMarkerMenu({
      menuEntries : handle.menuEntries,
      menuFontSize : handle.menuFontSize
    });

    // forward menu select events
    this.menu.addEventListener('menu-select', function(event) {
      that.dispatchEvent(event);
    });
  }
};
ROS3D.InteractiveMarker.prototype.__proto__ = THREE.Object3D.prototype;

/**
 * Show the interactive marker menu associated with this marker.
 *
 * @param control - the control to use
 * @param event - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.showMenu = function(control, event) {
  if (this.menu) {
    this.menu.show(control, event);
  }
};

/**
 * Move the axis based on the given event information.
 *
 * @param control - the control to use
 * @param origAxis - the origin of the axis
 * @param event3d - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.moveAxis = function(control, origAxis, event3d) {
  if (this.dragging) {
    var currentControlOri = control.currentControlOri;
    var axis = origAxis.clone().applyQuaternion(currentControlOri);
    // get move axis in world coords
    var originWorld = this.dragStart.event3d.intersection.point;
    var axisWorld = axis.clone().applyQuaternion(this.dragStart.orientationWorld.clone());

    var axisRay = new THREE.Ray(originWorld, axisWorld);

    // find closest point to mouse on axis
    var t = ROS3D.closestAxisPoint(axisRay, event3d.camera, event3d.mousePos);

    // offset from drag start position
    var p = new THREE.Vector3();
    p.addVectors(this.dragStart.position, axis.clone().applyQuaternion(this.dragStart.orientation)
        .multiplyScalar(t));
    this.setPosition(control, p);


    event3d.stopPropagation();
  }
};

/**
 * Move with respect to the plane based on the contorl and event.
 *
 * @param control - the control to use
 * @param origNormal - the normal of the origin
 * @param event3d - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.movePlane = function(control, origNormal, event3d) {
  if (this.dragging) {
    var currentControlOri = control.currentControlOri;
    var normal = origNormal.clone().applyQuaternion(currentControlOri);
    // get plane params in world coords
    var originWorld = this.dragStart.event3d.intersection.point;
    var normalWorld = normal.clone().applyQuaternion(this.dragStart.orientationWorld);

    // intersect mouse ray with plane
    var intersection = ROS3D.intersectPlane(event3d.mouseRay, originWorld, normalWorld);

    // offset from drag start position
    var p = new THREE.Vector3();
    p.subVectors(intersection, originWorld);
    p.add(this.dragStart.positionWorld);
    this.setPosition(control, p);
    event3d.stopPropagation();
  }
};

/**
 * Rotate based on the control and event given.
 *
 * @param control - the control to use
 * @param origOrientation - the orientation of the origin
 * @param event3d - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.rotateAxis = function(control, origOrientation, event3d) {
  if (this.dragging) {
    control.updateMatrixWorld();

    var currentControlOri = control.currentControlOri;
    var orientation = currentControlOri.clone().multiply(origOrientation.clone());

    var normal = (new THREE.Vector3(1, 0, 0)).applyQuaternion(orientation);

    // get plane params in world coords
    var originWorld = this.dragStart.event3d.intersection.point;
    var normalWorld = normal.applyQuaternion(this.dragStart.orientationWorld);

    // intersect mouse ray with plane
    var intersection = ROS3D.intersectPlane(event3d.mouseRay, originWorld, normalWorld);

    // offset local origin to lie on intersection plane
    var normalRay = new THREE.Ray(this.dragStart.positionWorld, normalWorld);
    var rotOrigin = ROS3D.intersectPlane(normalRay, originWorld, normalWorld);

    // rotates from world to plane coords
    var orientationWorld = this.dragStart.orientationWorld.clone().multiply(orientation);
    var orientationWorldInv = orientationWorld.clone().inverse();

    // rotate original and current intersection into local coords
    intersection.sub(rotOrigin);
    intersection.applyQuaternion(orientationWorldInv);

    var origIntersection = this.dragStart.event3d.intersection.point.clone();
    origIntersection.sub(rotOrigin);
    origIntersection.applyQuaternion(orientationWorldInv);

    // compute relative 2d angle
    var a1 = Math.atan2(intersection.y, intersection.z);
    var a2 = Math.atan2(origIntersection.y, origIntersection.z);
    var a = a2 - a1;

    var rot = new THREE.Quaternion();
    rot.setFromAxisAngle(normal, a);

    // rotate
    this.setOrientation(control, rot.multiply(this.dragStart.orientationWorld));

    // offset from drag start position
    event3d.stopPropagation();
  }
};

/**
 * Dispatch the given event type.
 *
 * @param type - the type of event
 * @param control - the control to use
 */
ROS3D.InteractiveMarker.prototype.feedbackEvent = function(type, control) {
  this.dispatchEvent({
    type : type,
    position : this.position.clone(),
    orientation : this.quaternion.clone(),
    controlName : control.name
  });
};

/**
 * Start a drag action.
 *
 * @param control - the control to use
 * @param event3d - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.startDrag = function(control, event3d) {
  if (event3d.domEvent.button === 0) {
    event3d.stopPropagation();
    this.dragging = true;
    this.updateMatrixWorld(true);
    var scale = new THREE.Vector3();
    this.matrixWorld
        .decompose(this.dragStart.positionWorld, this.dragStart.orientationWorld, scale);
    this.dragStart.position = this.position.clone();
    this.dragStart.orientation = this.quaternion.clone();
    this.dragStart.event3d = event3d;

    this.feedbackEvent('user-mousedown', control);
  }
};

/**
 * Stop a drag action.
 *
 * @param control - the control to use
 * @param event3d - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.stopDrag = function(control, event3d) {
  if (event3d.domEvent.button === 0) {
    event3d.stopPropagation();
    this.dragging = false;
    this.dragStart.event3d = {};
    this.onServerSetPose(this.bufferedPoseEvent);
    this.bufferedPoseEvent = undefined;

    this.feedbackEvent('user-mouseup', control);
  }
};

/**
 * Handle a button click.
 *
 * @param control - the control to use
 * @param event3d - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.buttonClick = function(control, event3d) {
  event3d.stopPropagation();
  this.feedbackEvent('user-button-click', control);
};

/**
 * Handle a user pose change for the position.
 *
 * @param control - the control to use
 * @param event3d - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.setPosition = function(control, position) {
  this.position.copy(position);
  this.feedbackEvent('user-pose-change', control);
};

/**
 * Handle a user pose change for the orientation.
 *
 * @param control - the control to use
 * @param event3d - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.setOrientation = function(control, orientation) {
  orientation.normalize();
  this.quaternion.copy(orientation);
  this.feedbackEvent('user-pose-change', control);
};

/**
 * Update the marker based when the pose is set from the server.
 *
 * @param event - the event that caused this
 */
ROS3D.InteractiveMarker.prototype.onServerSetPose = function(event) {
  if (event !== undefined) {
    // don't update while dragging
    if (this.dragging) {
      this.bufferedPoseEvent = event;
    } else {
      var pose = event.pose;
      this.position.copy(pose.position);
      this.quaternion.copy(pose.orientation);
    }
  }
};

/**
 * Free memory of elements in this marker.
 */
ROS3D.InteractiveMarker.prototype.dispose = function() {
  var that = this;
  this.children.forEach(function(intMarkerControl) {
    intMarkerControl.children.forEach(function(marker) {
      marker.dispose();
      intMarkerControl.remove(marker);
    });
    that.remove(intMarkerControl);
  });
};

Object.assign(ROS3D.InteractiveMarker.prototype, THREE.EventDispatcher.prototype);

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * A client for an interactive marker topic.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - a handle to the ROS connection
 *  * tfClient - a handle to the TF client
 *  * topic (optional) - the topic to subscribe to, like '/basic_controls', if not provided use subscribe() to start message receiving
 *  * path (optional) - the base path to any meshes that will be loaded
 *  * camera - the main camera associated with the viewer for this marker client
 *  * rootObject (optional) - the root THREE 3D object to render to
 *  * loader (optional) - the Collada loader to use (e.g., an instance of ROS3D.COLLADA_LOADER
 *                        ROS3D.COLLADA_LOADER_2) -- defaults to ROS3D.COLLADA_LOADER_2
 *  * menuFontSize (optional) - the menu font size
 */
ROS3D.InteractiveMarkerClient = function(options) {
  var that = this;
  options = options || {};
  this.ros = options.ros;
  this.tfClient = options.tfClient;
  this.topicName = options.topic;
  this.path = options.path || '/';
  this.camera = options.camera;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.loader = options.loader || ROS3D.COLLADA_LOADER_2;
  this.menuFontSize = options.menuFontSize || '0.8em';

  this.interactiveMarkers = {};
  this.updateTopic = null;
  this.feedbackTopic = null;

  // check for an initial topic
  if (this.topicName) {
    this.subscribe(this.topicName);
  }
};

/**
 * Subscribe to the given interactive marker topic. This will unsubscribe from any current topics.
 *
 * @param topic - the topic to subscribe to, like '/basic_controls'
 */
ROS3D.InteractiveMarkerClient.prototype.subscribe = function(topic) {
  // unsubscribe to the other topics
  this.unsubscribe();

  this.updateTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : topic + '/tunneled/update',
    messageType : 'visualization_msgs/InteractiveMarkerUpdate',
    compression : 'png'
  });
  this.updateTopic.subscribe(this.processUpdate.bind(this));

  this.feedbackTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : topic + '/feedback',
    messageType : 'visualization_msgs/InteractiveMarkerFeedback',
    compression : 'png'
  });
  this.feedbackTopic.advertise();

  this.initService = new ROSLIB.Service({
    ros : this.ros,
    name : topic + '/tunneled/get_init',
    serviceType : 'demo_interactive_markers/GetInit'
  });
  var request = new ROSLIB.ServiceRequest({});
  this.initService.callService(request, this.processInit.bind(this));
};

/**
 * Unsubscribe from the current interactive marker topic.
 */
ROS3D.InteractiveMarkerClient.prototype.unsubscribe = function() {
  if (this.updateTopic) {
    this.updateTopic.unsubscribe();
  }
  if (this.feedbackTopic) {
    this.feedbackTopic.unadvertise();
  }
  // erase all markers
  for (var intMarkerName in this.interactiveMarkers) {
    this.eraseIntMarker(intMarkerName);
  }
  this.interactiveMarkers = {};
};

/**
 * Process the given interactive marker initialization message.
 *
 * @param initMessage - the interactive marker initialization message to process
 */
ROS3D.InteractiveMarkerClient.prototype.processInit = function(initMessage) {
  var message = initMessage.msg;

  // erase any old markers
  message.erases = [];
  for (var intMarkerName in this.interactiveMarkers) {
    message.erases.push(intMarkerName);
  }
  message.poses = [];

  // treat it as an update
  this.processUpdate(message);
};

/**
 * Process the given interactive marker update message.
 *
 * @param initMessage - the interactive marker update message to process
 */
ROS3D.InteractiveMarkerClient.prototype.processUpdate = function(message) {
  var that = this;

  // erase any markers
  message.erases.forEach(function(name) {
    that.eraseIntMarker(name);
  });

  // updates marker poses
  message.poses.forEach(function(poseMessage) {
    var marker = that.interactiveMarkers[poseMessage.name];
    if (marker) {
      marker.setPoseFromServer(poseMessage.pose);
    }
  });

  // add new markers
  message.markers.forEach(function(msg) {
    // get rid of anything with the same name
    var oldhandle = that.interactiveMarkers[msg.name];
    if (oldhandle) {
      that.eraseIntMarker(oldhandle.name);
    }

    // create the handle
    var handle = new ROS3D.InteractiveMarkerHandle({
      message : msg,
      feedbackTopic : that.feedbackTopic,
      tfClient : that.tfClient,
      menuFontSize : that.menuFontSize
    });
    that.interactiveMarkers[msg.name] = handle;

    // create the actual marker
    var intMarker = new ROS3D.InteractiveMarker({
      handle : handle,
      camera : that.camera,
      path : that.path,
      loader : that.loader
    });
    // add it to the scene
    intMarker.name = msg.name;
    that.rootObject.add(intMarker);

    // listen for any pose updates from the server
    handle.on('pose', function(pose) {
      intMarker.onServerSetPose({
        pose : pose
      });
    });

    // add bound versions of UI handlers
    intMarker.addEventListener('user-pose-change', handle.setPoseFromClientBound);
    intMarker.addEventListener('user-mousedown', handle.onMouseDownBound);
    intMarker.addEventListener('user-mouseup', handle.onMouseUpBound);
    intMarker.addEventListener('user-button-click', handle.onButtonClickBound);
    intMarker.addEventListener('menu-select', handle.onMenuSelectBound);

    // now listen for any TF changes
    handle.subscribeTf();
  });
};

/**
 * Erase the interactive marker with the given name.
 *
 * @param intMarkerName - the interactive marker name to delete
 */
ROS3D.InteractiveMarkerClient.prototype.eraseIntMarker = function(intMarkerName) {
  if (this.interactiveMarkers[intMarkerName]) {
    // remove the object
    var targetIntMarker = this.rootObject.getObjectByName(intMarkerName);
    this.rootObject.remove(targetIntMarker);
    // unsubscribe from TF topic!
    var handle = this.interactiveMarkers[intMarkerName];
    handle.unsubscribeTf();

    // remove all other listeners

    targetIntMarker.removeEventListener('user-pose-change', handle.setPoseFromClientBound);
    targetIntMarker.removeEventListener('user-mousedown', handle.onMouseDownBound);
    targetIntMarker.removeEventListener('user-mouseup', handle.onMouseUpBound);
    targetIntMarker.removeEventListener('user-button-click', handle.onButtonClickBound);
    targetIntMarker.removeEventListener('menu-select', handle.onMenuSelectBound);

    // remove the handle from the map - after leaving this function's scope, there should be no references to the handle
    delete this.interactiveMarkers[intMarkerName];
    targetIntMarker.dispose();
  }
};

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * The main marker control object for an interactive marker.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * parent - the parent of this control
 *  * message - the interactive marker control message
 *  * camera - the main camera associated with the viewer for this marker client
 *  * path (optional) - the base path to any meshes that will be loaded
 *  * loader (optional) - the Collada loader to use (e.g., an instance of ROS3D.COLLADA_LOADER
 *                        ROS3D.COLLADA_LOADER_2) -- defaults to ROS3D.COLLADA_LOADER_2
 */
ROS3D.InteractiveMarkerControl = function(options) {
  var that = this;
  THREE.Object3D.call(this);

  options = options || {};
  this.parent = options.parent;
  var handle = options.handle;
  var message = options.message;
  this.name = message.name;
  this.camera = options.camera;
  this.path = options.path || '/';
  this.loader = options.loader || ROS3D.COLLADA_LOADER_2;
  this.dragging = false;
  this.startMousePos = new THREE.Vector2();

  // orientation for the control
  var controlOri = new THREE.Quaternion(message.orientation.x, message.orientation.y,
      message.orientation.z, message.orientation.w);
  controlOri.normalize();

  // transform x axis into local frame
  var controlAxis = new THREE.Vector3(1, 0, 0);
  controlAxis.applyQuaternion(controlOri);

  this.currentControlOri = new THREE.Quaternion();

  // determine mouse interaction
  switch (message.interaction_mode) {
    case ROS3D.INTERACTIVE_MARKER_MOVE_AXIS:
      this.addEventListener('mousemove', this.parent.moveAxis.bind(this.parent, this, controlAxis));
      this.addEventListener('touchmove', this.parent.moveAxis.bind(this.parent, this, controlAxis));
      break;
    case ROS3D.INTERACTIVE_MARKER_ROTATE_AXIS:
      this
          .addEventListener('mousemove', this.parent.rotateAxis.bind(this.parent, this, controlOri));
      break;
    case ROS3D.INTERACTIVE_MARKER_MOVE_PLANE:
      this
          .addEventListener('mousemove', this.parent.movePlane.bind(this.parent, this, controlAxis));
      break;
    case ROS3D.INTERACTIVE_MARKER_BUTTON:
      this.addEventListener('click', this.parent.buttonClick.bind(this.parent, this));
      break;
    default:
      break;
  }

  /**
   * Install default listeners for highlighting / dragging.
   *
   * @param event - the event to stop
   */
  function stopPropagation(event) {
    event.stopPropagation();
  }

  // check the mode
  if (message.interaction_mode !== ROS3D.INTERACTIVE_MARKER_NONE) {
    this.addEventListener('mousedown', this.parent.startDrag.bind(this.parent, this));
    this.addEventListener('mouseup', this.parent.stopDrag.bind(this.parent, this));
    this.addEventListener('contextmenu', this.parent.showMenu.bind(this.parent, this));
    this.addEventListener('mouseup', function(event3d) {
      if (that.startMousePos.distanceToSquared(event3d.mousePos) === 0) {
        event3d.type = 'contextmenu';
        that.dispatchEvent(event3d);
      }
    });
    this.addEventListener('mouseover', stopPropagation);
    this.addEventListener('mouseout', stopPropagation);
    this.addEventListener('click', stopPropagation);
    this.addEventListener('mousedown', function(event3d) {
      that.startMousePos = event3d.mousePos;
    });

    // touch support
    this.addEventListener('touchstart', function(event3d) {
      if (event3d.domEvent.touches.length === 1) {
        event3d.type = 'mousedown';
        event3d.domEvent.button = 0;
        that.dispatchEvent(event3d);
      }
    });
    this.addEventListener('touchmove', function(event3d) {
      if (event3d.domEvent.touches.length === 1) {
        event3d.type = 'mousemove';
        event3d.domEvent.button = 0;
        that.dispatchEvent(event3d);
      }
    });
    this.addEventListener('touchend', function(event3d) {
      if (event3d.domEvent.touches.length === 0) {
        event3d.domEvent.button = 0;
        event3d.type = 'mouseup';
        that.dispatchEvent(event3d);
        event3d.type = 'click';
        that.dispatchEvent(event3d);
      }
    });
  }

  // rotation behavior
  var rotInv = new THREE.Quaternion();
  var posInv = this.parent.position.clone().multiplyScalar(-1);
  switch (message.orientation_mode) {
    case ROS3D.INTERACTIVE_MARKER_INHERIT:
      rotInv = this.parent.quaternion.clone().inverse();
      this.updateMatrixWorld = function(force) {
        ROS3D.InteractiveMarkerControl.prototype.updateMatrixWorld.call(that, force);
        that.currentControlOri.copy(that.quaternion);
        that.currentControlOri.normalize();
      };
      break;
    case ROS3D.INTERACTIVE_MARKER_FIXED:
      this.updateMatrixWorld = function(force) {
        that.quaternion.copy(that.parent.quaternion.clone().inverse());
        that.updateMatrix();
        that.matrixWorldNeedsUpdate = true;
        ROS3D.InteractiveMarkerControl.prototype.updateMatrixWorld.call(that, force);
        that.currentControlOri.copy(that.quaternion);
      };
      break;
    case ROS3D.INTERACTIVE_MARKER_VIEW_FACING:
      var independentMarkerOrientation = message.independent_marker_orientation;
      this.updateMatrixWorld = function(force) {
        that.camera.updateMatrixWorld();
        var cameraRot = new THREE.Matrix4().extractRotation(that.camera.matrixWorld);

        var ros2Gl = new THREE.Matrix4();
        var r90 = Math.PI * 0.5;
        var rv = new THREE.Euler(-r90, 0, r90);
        ros2Gl.makeRotationFromEuler(rv);

        var worldToLocal = new THREE.Matrix4();
        worldToLocal.getInverse(that.parent.matrixWorld);

        cameraRot.multiplyMatrices(cameraRot, ros2Gl);
        cameraRot.multiplyMatrices(worldToLocal, cameraRot);

        that.currentControlOri.setFromRotationMatrix(cameraRot);

        // check the orientation
        if (!independentMarkerOrientation) {
          that.quaternion.copy(that.currentControlOri);
          that.updateMatrix();
          that.matrixWorldNeedsUpdate = true;
        }
        ROS3D.InteractiveMarkerControl.prototype.updateMatrixWorld.call(that, force);
      };
      break;
    default:
      console.error('Unkown orientation mode: ' + message.orientation_mode);
      break;
  }

  // temporary TFClient to get transformations from InteractiveMarker
  // frame to potential child Marker frames
  var localTfClient = new ROSLIB.TFClient({
    ros : handle.tfClient.ros,
    fixedFrame : handle.message.header.frame_id,
    serverName : handle.tfClient.serverName
  });

  // create visuals (markers)
  message.markers.forEach(function(markerMsg) {
    var addMarker = function(transformMsg) {
      var markerHelper = new ROS3D.Marker({
        message : markerMsg,
        path : that.path,
        loader : that.loader
      });

      // if transformMsg isn't null, this was called by TFClient
      if (transformMsg !== null) {
        // get the current pose as a ROSLIB.Pose...
        var newPose = new ROSLIB.Pose({
          position : markerHelper.position,
          orientation : markerHelper.quaternion
        });
        // so we can apply the transform provided by the TFClient
        newPose.applyTransform(new ROSLIB.Transform(transformMsg));

        // get transform between parent marker's location and its frame
        // apply it to sub-marker position to get sub-marker position
        // relative to parent marker
        var transformMarker = new ROS3D.Marker({
          message : markerMsg,
          path : that.path,
          loader : that.loader
        });
        transformMarker.position.add(posInv);
        transformMarker.position.applyQuaternion(rotInv);
        transformMarker.quaternion.multiplyQuaternions(rotInv, transformMarker.quaternion);
        var translation = new THREE.Vector3(transformMarker.position.x, transformMarker.position.y, transformMarker.position.z);
        var transform = new ROSLIB.Transform({
          translation : translation,
          orientation : transformMarker.quaternion
        });

        // apply that transform too
        newPose.applyTransform(transform);

        markerHelper.setPose(newPose);

        markerHelper.updateMatrixWorld();
        // we only need to set the pose once - at least, this is what RViz seems to be doing, might change in the future
        localTfClient.unsubscribe(markerMsg.header.frame_id);
      }

      // add the marker
      that.add(markerHelper);
    };

    // If the marker is not relative to the parent marker's position,
    // ask the *local* TFClient for the transformation from the
    // InteractiveMarker frame to the sub-Marker frame
    if (markerMsg.header.frame_id !== '') {
      localTfClient.subscribe(markerMsg.header.frame_id, addMarker);
    }
    // If not, just add the marker without changing its pose
    else {
      addMarker(null);
    }
  });

  localTfClient.dispose();
};
ROS3D.InteractiveMarkerControl.prototype.__proto__ = THREE.Object3D.prototype;

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * Handle with signals for a single interactive marker.
 *
 * Emits the following events:
 *
 *  * 'pose' - emitted when a new pose comes from the server
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * message - the interactive marker message
 *  * feedbackTopic - the ROSLIB.Topic associated with the feedback
 *  * tfClient - a handle to the TF client to use
 *  * menuFontSize (optional) - the menu font size
 */
ROS3D.InteractiveMarkerHandle = function(options) {
  options = options || {};
  this.message = options.message;
  this.feedbackTopic = options.feedbackTopic;
  this.tfClient = options.tfClient;
  this.menuFontSize = options.menuFontSize || '0.8em';
  this.name = this.message.name;
  this.header = this.message.header;
  this.controls = this.message.controls;
  this.menuEntries = this.message.menu_entries;
  this.dragging = false;
  this.timeoutHandle = null;
  this.tfTransform = new ROSLIB.Transform();
  this.pose = new ROSLIB.Pose();

  this.setPoseFromClientBound = this.setPoseFromClient.bind(this);
  this.onMouseDownBound = this.onMouseDown.bind(this);
  this.onMouseUpBound = this.onMouseUp.bind(this);
  this.onButtonClickBound = this.onButtonClick.bind(this);
  this.onMenuSelectBound = this.onMenuSelect.bind(this);

  // start by setting the pose
  this.setPoseFromServer(this.message.pose);
  this.tfUpdateBound = this.tfUpdate.bind(this);
};
ROS3D.InteractiveMarkerHandle.prototype.__proto__ = EventEmitter2.prototype;

/**
 * Subscribe to the TF associated with this interactive marker.
 */
ROS3D.InteractiveMarkerHandle.prototype.subscribeTf = function() {
  // subscribe to tf updates if frame-fixed
  if (this.message.header.stamp.secs === 0.0 && this.message.header.stamp.nsecs === 0.0) {
    this.tfClient.subscribe(this.message.header.frame_id, this.tfUpdateBound);
  }
};

ROS3D.InteractiveMarkerHandle.prototype.unsubscribeTf = function() {
  this.tfClient.unsubscribe(this.message.header.frame_id, this.tfUpdateBound);
};

/**
 * Emit the new pose that has come from the server.
 */
ROS3D.InteractiveMarkerHandle.prototype.emitServerPoseUpdate = function() {
  var poseTransformed = new ROSLIB.Pose(this.pose);
  poseTransformed.applyTransform(this.tfTransform);
  this.emit('pose', poseTransformed);
};

/**
 * Update the pose based on the pose given by the server.
 *
 * @param poseMsg - the pose given by the server
 */
ROS3D.InteractiveMarkerHandle.prototype.setPoseFromServer = function(poseMsg) {
  this.pose = new ROSLIB.Pose(poseMsg);
  this.emitServerPoseUpdate();
};

/**
 * Update the pose based on the TF given by the server.
 *
 * @param transformMsg - the TF given by the server
 */
ROS3D.InteractiveMarkerHandle.prototype.tfUpdate = function(transformMsg) {
  this.tfTransform = new ROSLIB.Transform(transformMsg);
  this.emitServerPoseUpdate();
};

/**
 * Set the pose from the client based on the given event.
 *
 * @param event - the event to base the change off of
 */
ROS3D.InteractiveMarkerHandle.prototype.setPoseFromClient = function(event) {
  // apply the transform
  this.pose = new ROSLIB.Pose(event);
  var inv = this.tfTransform.clone();
  inv.rotation.invert();
  inv.translation.multiplyQuaternion(inv.rotation);
  inv.translation.x *= -1;
  inv.translation.y *= -1;
  inv.translation.z *= -1;
  this.pose.applyTransform(inv);

  // send feedback to the server
  this.sendFeedback(ROS3D.INTERACTIVE_MARKER_POSE_UPDATE, undefined, 0, event.controlName);

  // keep sending pose feedback until the mouse goes up
  if (this.dragging) {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    this.timeoutHandle = setTimeout(this.setPoseFromClient.bind(this, event), 250);
  }
};

/**
 * Send the button click feedback to the server.
 *
 * @param event - the event associated with the button click
 */
ROS3D.InteractiveMarkerHandle.prototype.onButtonClick = function(event) {
  this.sendFeedback(ROS3D.INTERACTIVE_MARKER_BUTTON_CLICK, event.clickPosition, 0,
      event.controlName);
};

/**
 * Send the mousedown feedback to the server.
 *
 * @param event - the event associated with the mousedown
 */
ROS3D.InteractiveMarkerHandle.prototype.onMouseDown = function(event) {
  this.sendFeedback(ROS3D.INTERACTIVE_MARKER_MOUSE_DOWN, event.clickPosition, 0, event.controlName);
  this.dragging = true;
};

/**
 * Send the mouseup feedback to the server.
 *
 * @param event - the event associated with the mouseup
 */
ROS3D.InteractiveMarkerHandle.prototype.onMouseUp = function(event) {
  this.sendFeedback(ROS3D.INTERACTIVE_MARKER_MOUSE_UP, event.clickPosition, 0, event.controlName);
  this.dragging = false;
  if (this.timeoutHandle) {
    clearTimeout(this.timeoutHandle);
  }
};

/**
 * Send the menu select feedback to the server.
 *
 * @param event - the event associated with the menu select
 */
ROS3D.InteractiveMarkerHandle.prototype.onMenuSelect = function(event) {
  this.sendFeedback(ROS3D.INTERACTIVE_MARKER_MENU_SELECT, undefined, event.id, event.controlName);
};

/**
 * Send feedback to the interactive marker server.
 *
 * @param eventType - the type of event that happened
 * @param clickPosition (optional) - the position in ROS space the click happened
 * @param menuEntryID (optional) - the menu entry ID that is associated
 * @param controlName - the name of the control
 */
ROS3D.InteractiveMarkerHandle.prototype.sendFeedback = function(eventType, clickPosition,
    menuEntryID, controlName) {

  // check for the click position
  var mousePointValid = clickPosition !== undefined;
  clickPosition = clickPosition || {
    x : 0,
    y : 0,
    z : 0
  };

  var feedback = {
    header : this.header,
    client_id : this.clientID,
    marker_name : this.name,
    control_name : controlName,
    event_type : eventType,
    pose : this.pose,
    mouse_point : clickPosition,
    mouse_point_valid : mousePointValid,
    menu_entry_id : menuEntryID
  };
  this.feedbackTopic.publish(feedback);
};

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * A menu for an interactive marker. This will be overlayed on the canvas.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * menuEntries - the menu entries to add
 *  * className (optional) - a custom CSS class for the menu div
 *  * entryClassName (optional) - a custom CSS class for the menu entry
 *  * overlayClassName (optional) - a custom CSS class for the menu overlay
 *  * menuFontSize (optional) - the menu font size
 */
ROS3D.InteractiveMarkerMenu = function(options) {
  var that = this;
  options = options || {};
  var menuEntries = options.menuEntries;
  var className = options.className || 'default-interactive-marker-menu';
  var entryClassName = options.entryClassName || 'default-interactive-marker-menu-entry';
  var overlayClassName = options.overlayClassName || 'default-interactive-marker-overlay';
  var menuFontSize = options.menuFontSize || '0.8em';

  // holds the menu tree
  var allMenus = [];
  allMenus[0] = {
    children : []
  };

  THREE.EventDispatcher.call(this);

  // create the CSS for this marker if it has not been created
  if (document.getElementById('default-interactive-marker-menu-css') === null) {
    var style = document.createElement('style');
    style.id = 'default-interactive-marker-menu-css';
    style.type = 'text/css';
    style.innerHTML = '.default-interactive-marker-menu {' + 'background-color: #444444;'
        + 'border: 1px solid #888888;' + 'border: 1px solid #888888;' + 'padding: 0px 0px 0px 0px;'
        + 'color: #FFFFFF;' + 'font-family: sans-serif;' + 'font-size: ' + menuFontSize +';' + 'z-index: 1002;'
        + '}' + '.default-interactive-marker-menu ul {' + 'padding: 0px 0px 5px 0px;'
        + 'margin: 0px;' + 'list-style-type: none;' + '}'
        + '.default-interactive-marker-menu ul li div {' + '-webkit-touch-callout: none;'
        + '-webkit-user-select: none;' + '-khtml-user-select: none;' + '-moz-user-select: none;'
        + '-ms-user-select: none;' + 'user-select: none;' + 'cursor: default;'
        + 'padding: 3px 10px 3px 10px;' + '}' + '.default-interactive-marker-menu-entry:hover {'
        + '  background-color: #666666;' + '  cursor: pointer;' + '}'
        + '.default-interactive-marker-menu ul ul {' + '  font-style: italic;'
        + '  padding-left: 10px;' + '}' + '.default-interactive-marker-overlay {'
        + '  position: absolute;' + '  top: 0%;' + '  left: 0%;' + '  width: 100%;'
        + '  height: 100%;' + '  background-color: black;' + '  z-index: 1001;'
        + '  -moz-opacity: 0.0;' + '  opacity: .0;' + '  filter: alpha(opacity = 0);' + '}';
    document.getElementsByTagName('head')[0].appendChild(style);
  }

  // place the menu in a div
  this.menuDomElem = document.createElement('div');
  this.menuDomElem.style.position = 'absolute';
  this.menuDomElem.className = className;
  this.menuDomElem.addEventListener('contextmenu', function(event) {
    event.preventDefault();
  });

  // create the overlay DOM
  this.overlayDomElem = document.createElement('div');
  this.overlayDomElem.className = overlayClassName;

  this.hideListener = this.hide.bind(this);
  this.overlayDomElem.addEventListener('contextmenu', this.hideListener);
  this.overlayDomElem.addEventListener('click', this.hideListener);
  this.overlayDomElem.addEventListener('touchstart', this.hideListener);

  // parse all entries and link children to parents
  var i, entry, id;
  for ( i = 0; i < menuEntries.length; i++) {
    entry = menuEntries[i];
    id = entry.id;
    allMenus[id] = {
      title : entry.title,
      id : id,
      children : []
    };
  }
  for ( i = 0; i < menuEntries.length; i++) {
    entry = menuEntries[i];
    id = entry.id;
    var menu = allMenus[id];
    var parent = allMenus[entry.parent_id];
    parent.children.push(menu);
  }

  function emitMenuSelect(menuEntry, domEvent) {
    this.dispatchEvent({
      type : 'menu-select',
      domEvent : domEvent,
      id : menuEntry.id,
      controlName : this.controlName
    });
    this.hide(domEvent);
  }

  /**
   * Create the HTML UL element for the menu and link it to the parent.
   *
   * @param parentDomElem - the parent DOM element
   * @param parentMenu - the parent menu
   */
  function makeUl(parentDomElem, parentMenu) {

    var ulElem = document.createElement('ul');
    parentDomElem.appendChild(ulElem);

    var children = parentMenu.children;

    for ( var i = 0; i < children.length; i++) {
      var liElem = document.createElement('li');
      var divElem = document.createElement('div');
      divElem.appendChild(document.createTextNode(children[i].title));
      ulElem.appendChild(liElem);
      liElem.appendChild(divElem);

      if (children[i].children.length > 0) {
        makeUl(liElem, children[i]);
        divElem.addEventListener('click', that.hide.bind(that));
        divElem.addEventListener('touchstart', that.hide.bind(that));
      } else {
        divElem.addEventListener('click', emitMenuSelect.bind(that, children[i]));
        divElem.addEventListener('touchstart', emitMenuSelect.bind(that, children[i]));
        divElem.className = 'default-interactive-marker-menu-entry';
      }
    }

  }

  // construct DOM element
  makeUl(this.menuDomElem, allMenus[0]);
};

/**
 * Shoe the menu DOM element.
 *
 * @param control - the control for the menu
 * @param event - the event that caused this
 */
ROS3D.InteractiveMarkerMenu.prototype.show = function(control, event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }

  this.controlName = control.name;

  // position it on the click
  if (event.domEvent.changedTouches !== undefined) {
    // touch click
    this.menuDomElem.style.left = event.domEvent.changedTouches[0].pageX + 'px';
    this.menuDomElem.style.top = event.domEvent.changedTouches[0].pageY + 'px';
  } else {
    // mouse click
    this.menuDomElem.style.left = event.domEvent.clientX + 'px';
    this.menuDomElem.style.top = event.domEvent.clientY + 'px';
  }
  document.body.appendChild(this.overlayDomElem);
  document.body.appendChild(this.menuDomElem);
};

/**
 * Hide the menu DOM element.
 *
 * @param event (optional) - the event that caused this
 */
ROS3D.InteractiveMarkerMenu.prototype.hide = function(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }

  document.body.removeChild(this.overlayDomElem);
  document.body.removeChild(this.menuDomElem);
};

Object.assign(ROS3D.InteractiveMarkerMenu.prototype, THREE.EventDispatcher.prototype);

/**
 * @author David Gossow - dgossow@willowgarage.com
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * A Marker can convert a ROS marker message into a THREE object.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * path - the base path or URL for any mesh files that will be loaded for this marker
 *   * message - the marker message
 */
ROS3D.Marker = function(options) {
  options = options || {};
  var path = options.path || '/';
  var message = options.message;

  // check for a trailing '/'
  if (path.substr(path.length - 1) !== '/') {
    path += '/';
  }

  THREE.Object3D.call(this);
  
  if(message.scale) {
    this.msgScale = [message.scale.x, message.scale.y, message.scale.z];
  }
  else {
    this.msgScale = [1,1,1];
  }
  this.msgColor = message.color;
  this.msgMesh = undefined;

  // set the pose and get the color
  this.setPose(message.pose);
  var colorMaterial = ROS3D.makeColorMaterial(this.msgColor.r,
      this.msgColor.g, this.msgColor.b, this.msgColor.a);

  // create the object based on the type
  switch (message.type) {
    case ROS3D.MARKER_ARROW:
      // get the sizes for the arrow
      var len = message.scale.x;
      var headLength = len * 0.23;
      var headDiameter = message.scale.y;
      var shaftDiameter = headDiameter * 0.5;

      // determine the points
      var direction, p1 = null;
      if (message.points.length === 2) {
        p1 = new THREE.Vector3(message.points[0].x, message.points[0].y, message.points[0].z);
        var p2 = new THREE.Vector3(message.points[1].x, message.points[1].y, message.points[1].z);
        direction = p1.clone().negate().add(p2);
        // direction = p2 - p1;
        len = direction.length();
        headDiameter = message.scale.y;
        shaftDiameter = message.scale.x;

        if (message.scale.z !== 0.0) {
          headLength = message.scale.z;
        }
      }

      // add the marker
      this.add(new ROS3D.Arrow({
        direction : direction,
        origin : p1,
        length : len,
        headLength : headLength,
        shaftDiameter : shaftDiameter,
        headDiameter : headDiameter,
        material : colorMaterial
      }));
      break;
    case ROS3D.MARKER_CUBE:
      // set the cube dimensions
      var cubeGeom = new THREE.BoxGeometry(message.scale.x, message.scale.y, message.scale.z);
      this.add(new THREE.Mesh(cubeGeom, colorMaterial));
      break;
    case ROS3D.MARKER_SPHERE:
      // set the sphere dimensions
      var sphereGeom = new THREE.SphereGeometry(0.5);
      var sphereMesh = new THREE.Mesh(sphereGeom, colorMaterial);
      sphereMesh.scale.x = message.scale.x;
      sphereMesh.scale.y = message.scale.y;
      sphereMesh.scale.z = message.scale.z;
      this.add(sphereMesh);
      break;
    case ROS3D.MARKER_CYLINDER:
      // set the cylinder dimensions
      var cylinderGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, false);
      var cylinderMesh = new THREE.Mesh(cylinderGeom, colorMaterial);
      cylinderMesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * 0.5);
      cylinderMesh.scale.set(message.scale.x, message.scale.z, message.scale.y);
      this.add(cylinderMesh);
      break;
    case ROS3D.MARKER_LINE_STRIP:
      var lineStripGeom = new THREE.Geometry();
      var lineStripMaterial = new THREE.LineBasicMaterial({
        size : message.scale.x
      });

      // add the points
      var j;
      for ( j = 0; j < message.points.length; j++) {
        var pt = new THREE.Vector3();
        pt.x = message.points[j].x;
        pt.y = message.points[j].y;
        pt.z = message.points[j].z;
        lineStripGeom.vertices.push(pt);
      }

      // determine the colors for each
      if (message.colors.length === message.points.length) {
        lineStripMaterial.vertexColors = true;
        for ( j = 0; j < message.points.length; j++) {
          var clr = new THREE.Color();
          clr.setRGB(message.colors[j].r, message.colors[j].g, message.colors[j].b);
          lineStripGeom.colors.push(clr);
        }
      } else {
        lineStripMaterial.color.setRGB(message.color.r, message.color.g, message.color.b);
      }

      // add the line
      this.add(new THREE.Line(lineStripGeom, lineStripMaterial));
      break;
    case ROS3D.MARKER_LINE_LIST:
      var lineListGeom = new THREE.Geometry();
      var lineListMaterial = new THREE.LineBasicMaterial({
        size : message.scale.x
      });

      // add the points
      var k;
      for ( k = 0; k < message.points.length; k++) {
        var v = new THREE.Vector3();
        v.x = message.points[k].x;
        v.y = message.points[k].y;
        v.z = message.points[k].z;
        lineListGeom.vertices.push(v);
      }

      // determine the colors for each
      if (message.colors.length === message.points.length) {
        lineListMaterial.vertexColors = true;
        for ( k = 0; k < message.points.length; k++) {
          var c = new THREE.Color();
          c.setRGB(message.colors[k].r, message.colors[k].g, message.colors[k].b);
          lineListGeom.colors.push(c);
        }
      } else {
        lineListMaterial.color.setRGB(message.color.r, message.color.g, message.color.b);
      }

      // add the line
      this.add(new THREE.Line(lineListGeom, lineListMaterial,THREE.LinePieces));
      break;
    case ROS3D.MARKER_CUBE_LIST:
      // holds the main object
      var object = new THREE.Object3D();
      
      // check if custom colors should be used
      var numPoints = message.points.length;
      var createColors = (numPoints === message.colors.length);
      // do not render giant lists
      var stepSize = Math.ceil(numPoints / 1250);
        
      // add the points
      var p, cube, curColor, newMesh;
      for (p = 0; p < numPoints; p+=stepSize) {
        cube = new THREE.BoxGeometry(message.scale.x, message.scale.y, message.scale.z);

        // check the color
        if(createColors) {
          curColor = ROS3D.makeColorMaterial(message.colors[p].r, message.colors[p].g, message.colors[p].b, message.colors[p].a);
        } else {
          curColor = colorMaterial;
        }

        newMesh = new THREE.Mesh(cube, curColor);
        newMesh.position.x = message.points[p].x;
        newMesh.position.y = message.points[p].y;
        newMesh.position.z = message.points[p].z;
        object.add(newMesh);
      }

      this.add(object);
      break;
    case ROS3D.MARKER_SPHERE_LIST:
      // holds the main object
      var sphereObject = new THREE.Object3D();
      
      // check if custom colors should be used
      var numSpherePoints = message.points.length;
      var createSphereColors = (numSpherePoints === message.colors.length);
      // do not render giant lists
      var sphereStepSize = Math.ceil(numSpherePoints / 1250);
        
      // add the points
      var q, sphere, curSphereColor, newSphereMesh;
      for (q = 0; q < numSpherePoints; q+=sphereStepSize) {
        sphere = new THREE.SphereGeometry(0.5, 8, 8);
        
        // check the color
        if(createSphereColors) {
          curSphereColor = ROS3D.makeColorMaterial(message.colors[q].r, message.colors[q].g, message.colors[q].b, message.colors[q].a);
        } else {
          curSphereColor = colorMaterial;
        }
        
        newSphereMesh = new THREE.Mesh(sphere, curSphereColor);
        newSphereMesh.scale.x = message.scale.x;
        newSphereMesh.scale.y = message.scale.y;
        newSphereMesh.scale.z = message.scale.z;
        newSphereMesh.position.x = message.points[q].x;
        newSphereMesh.position.y = message.points[q].y;
        newSphereMesh.position.z = message.points[q].z;
        sphereObject.add(newSphereMesh);
      }
      this.add(sphereObject);
      break;
    case ROS3D.MARKER_POINTS:
      // for now, use a particle system for the lists
      var geometry = new THREE.Geometry();
      var material = new THREE.ParticleBasicMaterial({
        size : message.scale.x
      });

      // add the points
      var i;
      for ( i = 0; i < message.points.length; i++) {
        var vertex = new THREE.Vector3();
        vertex.x = message.points[i].x;
        vertex.y = message.points[i].y;
        vertex.z = message.points[i].z;
        geometry.vertices.push(vertex);
      }

      // determine the colors for each
      if (message.colors.length === message.points.length) {
        material.vertexColors = true;
        for ( i = 0; i < message.points.length; i++) {
          var color = new THREE.Color();
          color.setRGB(message.colors[i].r, message.colors[i].g, message.colors[i].b);
          geometry.colors.push(color);
        }
      } else {
        material.color.setRGB(message.color.r, message.color.g, message.color.b);
      }

      // add the particle system
      this.add(new THREE.ParticleSystem(geometry, material));
      break;
    case ROS3D.MARKER_TEXT_VIEW_FACING:
      // only work on non-empty text
      if (message.text.length > 0) {
        // Use a THREE.Sprite to always be view-facing
        // ( code from http://stackoverflow.com/a/27348780 )
        var textColor = this.msgColor;

        var canvas = document.createElement('canvas');
        var context = canvas.getContext('2d');
        var textHeight = 100;
        var fontString = 'normal ' + textHeight + 'px sans-serif';
        context.font = fontString;
        var metrics = context.measureText( message.text );
        var textWidth = metrics.width;

        canvas.width = textWidth;
        // To account for overhang (like the letter 'g'), make the canvas bigger
        // The non-text portion is transparent anyway
        canvas.height = 1.5 * textHeight;

        // this does need to be set again
        context.font = fontString;
        context.fillStyle = 'rgba('
          + Math.round(255 * textColor.r) + ', '
          + Math.round(255 * textColor.g) + ', '
          + Math.round(255 * textColor.b) + ', '
          + textColor.a + ')';
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        context.fillText( message.text, 0, canvas.height/2);

        var texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;

        var spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          // NOTE: This is needed for THREE.js r61, unused in r70
          useScreenCoordinates: false });
        var sprite = new THREE.Sprite( spriteMaterial );
        var textSize = message.scale.x;
        sprite.scale.set(textWidth / canvas.height * textSize, textSize, 1);

        this.add(sprite);      }
      break;
    case ROS3D.MARKER_MESH_RESOURCE:
      // load and add the mesh
      var meshColorMaterial = null;
      if(message.color.r !== 0 || message.color.g !== 0 ||
         message.color.b !== 0 || message.color.a !== 0) {
        meshColorMaterial = colorMaterial;
      }
      this.msgMesh = message.mesh_resource.substr(10);
      var meshResource = new ROS3D.MeshResource({
        path : path,
        resource :  this.msgMesh,
        material : meshColorMaterial,
      });
      meshResource.scale.fromArray(this.msgScale);
      this.add(meshResource);
      break;
    case ROS3D.MARKER_TRIANGLE_LIST:
      // create the list of triangles
      var tri = new ROS3D.TriangleList({
        material : colorMaterial,
        vertices : message.points,
        colors : message.colors
      });
      tri.scale.set(message.scale.x, message.scale.y, message.scale.z);
      this.add(tri);
      break;
    default:
      console.error('Currently unsupported marker type: ' + message.type);
      break;
  }
};
ROS3D.Marker.prototype.__proto__ = THREE.Object3D.prototype;

/**
 * Set the pose of this marker to the given values.
 *
 * @param pose - the pose to set for this marker
 */
ROS3D.Marker.prototype.setPose = function(pose) {
  // set position information
  this.position.x = pose.position.x;
  this.position.y = pose.position.y;
  this.position.z = pose.position.z;

  // set the rotation
  this.quaternion.set(pose.orientation.x, pose.orientation.y,
      pose.orientation.z, pose.orientation.w);
  this.quaternion.normalize();
};

/**
 * Update this marker.
 *
 * @param message - the marker message
 * @return true on success otherwhise false is returned
 */
ROS3D.Marker.prototype.update = function(message) {
  // set the pose and get the color
  this.setPose(message.pose);
  
  // Update color
  if(message.color.r !== this.msgColor.r ||
     message.color.g !== this.msgColor.g ||
     message.color.b !== this.msgColor.b ||
     message.color.a !== this.msgColor.a)
  {
      var colorMaterial = ROS3D.makeColorMaterial(
          message.color.r, message.color.g,
          message.color.b, message.color.a);
  
      switch (message.type) {
      case ROS3D.MARKER_LINE_STRIP:
      case ROS3D.MARKER_LINE_LIST:
      case ROS3D.MARKER_POINTS:
          break;
      case ROS3D.MARKER_ARROW:
      case ROS3D.MARKER_CUBE:
      case ROS3D.MARKER_SPHERE:
      case ROS3D.MARKER_CYLINDER:
      case ROS3D.MARKER_TRIANGLE_LIST:
      case ROS3D.MARKER_TEXT_VIEW_FACING:
          this.traverse (function (child){
              if (child instanceof THREE.Mesh) {
                  child.material = colorMaterial;
              }
          });
          break;
      case ROS3D.MARKER_MESH_RESOURCE:
          var meshColorMaterial = null;
          if(message.color.r !== 0 || message.color.g !== 0 ||
             message.color.b !== 0 || message.color.a !== 0) {
              meshColorMaterial = this.colorMaterial;
          }
          this.traverse (function (child){
              if (child instanceof THREE.Mesh) {
                  child.material = meshColorMaterial;
              }
          });
          break;
      case ROS3D.MARKER_CUBE_LIST:
      case ROS3D.MARKER_SPHERE_LIST:
          // TODO Support to update color for MARKER_CUBE_LIST & MARKER_SPHERE_LIST
          return false;
      default:
          return false;
      }
      
      this.msgColor = message.color;
  }
  
  // Update geometry
  var scaleChanged =
        Math.abs(this.msgScale[0] - message.scale.x) > 1.0e-6 ||
        Math.abs(this.msgScale[1] - message.scale.y) > 1.0e-6 ||
        Math.abs(this.msgScale[2] - message.scale.z) > 1.0e-6;
  this.msgScale = [message.scale.x, message.scale.y, message.scale.z];
  
  switch (message.type) {
    case ROS3D.MARKER_CUBE:
    case ROS3D.MARKER_SPHERE:
    case ROS3D.MARKER_CYLINDER:
        if(scaleChanged) {
            return false;
        }
        break;
    case ROS3D.MARKER_TEXT_VIEW_FACING:
        if(scaleChanged || this.text !== message.text) {
            return false;
        }
        break;
    case ROS3D.MARKER_MESH_RESOURCE:
        var meshResource = message.mesh_resource.substr(10);
        if(meshResource !== this.msgMesh) {
            return false;
        }
        if(scaleChanged) {
            return false;
        }
        break;
    case ROS3D.MARKER_ARROW:
    case ROS3D.MARKER_LINE_STRIP:
    case ROS3D.MARKER_LINE_LIST:
    case ROS3D.MARKER_CUBE_LIST:
    case ROS3D.MARKER_SPHERE_LIST:
    case ROS3D.MARKER_POINTS:
    case ROS3D.MARKER_TRIANGLE_LIST:
        // TODO: Check if geometry changed
        return false;
    default:
        break;
  }
  
  return true;
};

/*
 * Free memory of elements in this marker.
 */
ROS3D.Marker.prototype.dispose = function() {
  this.children.forEach(function(element) {
    if (element instanceof ROS3D.MeshResource) {
      element.children.forEach(function(scene) {
        if (scene.material !== undefined) {
          if(scene.material instanceof Array) {
            scene.material.forEach(function (mat) {mat.dispose();});
          } else {
            scene.material.dispose();
          }
        }
        scene.children.forEach(function(mesh) {
          if (mesh.geometry !== undefined) {
            mesh.geometry.dispose();
          }
          if (mesh.material !== undefined) {
            if(mesh.material instanceof Array) {
              mesh.material.forEach(function (mat) {mat.dispose();});
            } else {
              mesh.material.dispose();
            }
          }
          scene.remove(mesh);
        });
        element.remove(scene);
      });
    } else {
      if (element.geometry !== undefined) {
          element.geometry.dispose();
      }
      if (element.material !== undefined) {
          if(element.material instanceof Array) {
            element.material.forEach(function (mat) {mat.dispose();});
          } else {
            element.material.dispose();
          }
      }
    }
    element.parent.remove(element);
  });
};

/**
 * @author Russell Toris - rctoris@wpi.edu
 * @author Nils Berg - berg.nils@gmail.com
 */

/**
 * A MarkerArray client that listens to a given topic.
 *
 * Emits the following events:
 *
 *  * 'change' - there was an update or change in the MarkerArray
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic - the marker topic to listen to
 *   * tfClient - the TF client handle to use
 *   * rootObject (optional) - the root object to add the markers to
 *   * path (optional) - the base path to any meshes that will be loaded
 */
ROS3D.MarkerArrayClient = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic;
  this.tfClient = options.tfClient;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.path = options.path || '/';

  // Markers that are displayed (Map ns+id--Marker)
  this.markers = {};
  this.rosTopic = undefined;

  this.subscribe();
};
ROS3D.MarkerArrayClient.prototype.__proto__ = EventEmitter2.prototype;

ROS3D.MarkerArrayClient.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to MarkerArray topic
  this.rosTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : this.topicName,
    messageType : 'visualization_msgs/MarkerArray',
    compression : 'png'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.MarkerArrayClient.prototype.processMessage = function(arrayMessage){
  arrayMessage.markers.forEach(function(message) {
    if(message.action === 0) {
      var updated = false;
      if(message.ns + message.id in this.markers) { // "MODIFY"
        updated = this.markers[message.ns + message.id].children[0].update(message);
        if(!updated) { // "REMOVE"
          this.removeMarker(message.ns + message.id);
        }
      }
      if(!updated) { // "ADD"
        var newMarker = new ROS3D.Marker({
          message : message,
          path : this.path,
        });
        this.markers[message.ns + message.id] = new ROS3D.SceneNode({
          frameID : message.header.frame_id,
          tfClient : this.tfClient,
          object : newMarker
        });
        this.rootObject.add(this.markers[message.ns + message.id]);
      }
    }
    else if(message.action === 1) { // "DEPRECATED"
      console.warn('Received marker message with deprecated action identifier "1"');
    }
    else if(message.action === 2) { // "DELETE"
      this.removeMarker(message.ns + message.id);
    }
    else if(message.action === 3) { // "DELETE ALL"
      for (var m in this.markers){
        this.removeMarker(m);
      }
      this.markers = {};
    }
    else {
      console.warn('Received marker message with unknown action identifier "'+message.action+'"');
    }
  }.bind(this));

  this.emit('change');
};

ROS3D.MarkerArrayClient.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.MarkerArrayClient.prototype.removeMarker = function(key) {
  var oldNode = this.markers[key];
  if(!oldNode) {
    return;
  }
  oldNode.unsubscribeTf();
  this.rootObject.remove(oldNode);
  oldNode.children.forEach(function(child) {
    child.dispose();
  });
  delete(this.markers[key]);
};
/**
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * A marker client that listens to a given marker topic.
 *
 * Emits the following events:
 *
 *  * 'change' - there was an update or change in the marker
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic - the marker topic to listen to
 *   * tfClient - the TF client handle to use
 *   * rootObject (optional) - the root object to add this marker to
 *   * path (optional) - the base path to any meshes that will be loaded
 */
ROS3D.MarkerClient = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic;
  this.tfClient = options.tfClient;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.path = options.path || '/';

  // Markers that are displayed (Map ns+id--Marker)
  this.markers = {};
  this.rosTopic = undefined;

  this.subscribe();
};
ROS3D.MarkerClient.prototype.__proto__ = EventEmitter2.prototype;

ROS3D.MarkerClient.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.MarkerClient.prototype.checkTime = function(name){
    var curTime = new Date().getTime();
    if (curTime - this.updatedTime[name] > this.lifetime) {
        this.removeMarker(name);
        this.emit('change');
    } else {
        var that = this;
        setTimeout(function() {that.checkTime(name);},
                   100);
    }
};

ROS3D.MarkerClient.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : this.topicName,
    messageType : 'visualization_msgs/Marker',
    compression : 'png'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.MarkerClient.prototype.processMessage = function(message){
  var newMarker = new ROS3D.Marker({
    message : message,
    path : this.path,
  });

  // remove old marker from Three.Object3D children buffer
  var oldNode = this.markers[message.ns + message.id];
  if (oldNode) {
    this.removeMarker(message.ns + message.id);

  }

  this.markers[message.ns + message.id] = new ROS3D.SceneNode({
    frameID : message.header.frame_id,
    tfClient : this.tfClient,
    object : newMarker
  });
  this.rootObject.add(this.markers[message.ns + message.id]);

  this.emit('change');
};

ROS3D.MarkerClient.prototype.removeMarker = function(key) {
  var oldNode = this.markers[key];
  if(!oldNode) {
    return;
  }
  oldNode.unsubscribeTf();
  this.rootObject.remove(oldNode);
  oldNode.children.forEach(function(child) {
    child.dispose();
  });
  delete(this.markers[key]);
};

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * A Arrow is a THREE object that can be used to display an arrow model.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * origin (optional) - the origin of the arrow
 *   * direction (optional) - the direction vector of the arrow
 *   * length (optional) - the length of the arrow
 *   * headLength (optional) - the head length of the arrow
 *   * shaftDiameter (optional) - the shaft diameter of the arrow
 *   * headDiameter (optional) - the head diameter of the arrow
 *   * material (optional) - the material to use for this arrow
 */
ROS3D.Arrow = function(options) {
  options = options || {};
  var origin = options.origin || new THREE.Vector3(0, 0, 0);
  var direction = options.direction || new THREE.Vector3(1, 0, 0);
  var length = options.length || 1;
  var headLength = options.headLength || 0.2;
  var shaftDiameter = options.shaftDiameter || 0.05;
  var headDiameter = options.headDiameter || 0.1;
  var material = options.material || new THREE.MeshBasicMaterial();

  var shaftLength = length - headLength;

  // create and merge geometry
  var geometry = new THREE.CylinderGeometry(shaftDiameter * 0.5, shaftDiameter * 0.5, shaftLength,
      12, 1);
  var m = new THREE.Matrix4();
  m.setPosition(new THREE.Vector3(0, shaftLength * 0.5, 0));
  geometry.applyMatrix(m);

  // create the head
  var coneGeometry = new THREE.CylinderGeometry(0, headDiameter * 0.5, headLength, 12, 1);
  m.setPosition(new THREE.Vector3(0, shaftLength + (headLength * 0.5), 0));
  coneGeometry.applyMatrix(m);

  // put the arrow together
  geometry.merge(coneGeometry);

  THREE.Mesh.call(this, geometry, material);

  this.position.copy(origin);
  this.setDirection(direction);
};
ROS3D.Arrow.prototype.__proto__ = THREE.Mesh.prototype;

/**
 * Set the direction of this arrow to that of the given vector.
 *
 * @param direction - the direction to set this arrow
 */
ROS3D.Arrow.prototype.setDirection = function(direction) {
  var axis = new THREE.Vector3();
  if(direction.x === 0 && direction.z === 0){
    axis.set(1, 0, 0);
  } else {
    axis.set(0, 1, 0).cross(direction);
  }
  var radians = Math.acos(new THREE.Vector3(0, 1, 0).dot(direction.clone().normalize()));
  this.matrix = new THREE.Matrix4().makeRotationAxis(axis.normalize(), radians);
  this.rotation.setFromRotationMatrix(this.matrix, this.rotation.order);
};

/**
 * Set this arrow to be the given length.
 *
 * @param length - the new length of the arrow
 */
ROS3D.Arrow.prototype.setLength = function(length) {
  this.scale.set(length, length, length);
};

/**
 * Set the color of this arrow to the given hex value.
 *
 * @param hex - the hex value of the color to use
 */
ROS3D.Arrow.prototype.setColor = function(hex) {
  this.material.color.setHex(hex);
};

/*
 * Free memory of elements in this marker.
 */
ROS3D.Arrow.prototype.dispose = function() {
  if (this.geometry !== undefined) {
      this.geometry.dispose();
  }
  if (this.material !== undefined) {
      this.material.dispose();
  }
};

/**
 * @author Jihoon Lee - lee@magazino.eu
 */

/**
 * A Arrow is a THREE object that can be used to display an arrow model using ArrowHelper
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * origin (optional) - the origin of the arrow
 *   * direction (optional) - the direction vector of the arrow
 *   * length (optional) - the length of the arrow
 *   * headLength (optional) - the head length of the arrow
 *   * shaftDiameter (optional) - the shaft diameter of the arrow
 *   * headDiameter (optional) - the head diameter of the arrow
 *   * material (optional) - the material to use for this arrow
 */
ROS3D.Arrow2 = function(options) {
  options = options || {};
  var origin = options.origin || new THREE.Vector3(0, 0, 0);
  var direction = options.direction || new THREE.Vector3(1, 0, 0);
  var length = options.length || 1;
  var headLength = options.headLength || 0.2;
  var shaftDiameter = options.shaftDiameter || 0.05;
  var headDiameter = options.headDiameter || 0.1;
  var material = options.material || new THREE.MeshBasicMaterial();

  THREE.ArrowHelper.call(this, direction, origin, length, 0xff0000);

};

ROS3D.Arrow2.prototype.__proto__ = THREE.ArrowHelper.prototype;

/*
 * Free memory of elements in this object.
 */
ROS3D.Arrow2.prototype.dispose = function() {
  if (this.line !== undefined) {
      this.line.material.dispose();
      this.line.geometry.dispose();
  }
  if (this.cone!== undefined) {
      this.cone.material.dispose();
      this.cone.geometry.dispose();
  }
};

/*
ROS3D.Arrow2.prototype.setLength = function ( length, headLength, headWidth ) {
	if ( headLength === undefined ) {
    headLength = 0.2 * length;
  }
	if ( headWidth === undefined ) {
    headWidth = 0.2 * headLength;
  }

	this.line.scale.set( 1, Math.max( 0, length), 1 );
	this.line.updateMatrix();

	this.cone.scale.set( headWidth, headLength, headWidth );
	this.cone.position.y = length;
	this.cone.updateMatrix();

};
*/

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * An Axes object can be used to display the axis of a particular coordinate frame.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * shaftRadius (optional) - the radius of the shaft to render
 *   * headRadius (optional) - the radius of the head to render
 *   * headLength (optional) - the length of the head to render
 */
ROS3D.Axes = function(options) {
  var that = this;
  options = options || {};
  var shaftRadius = options.shaftRadius || 0.008;
  var headRadius = options.headRadius || 0.023;
  var headLength = options.headLength || 0.1;

  THREE.Object3D.call(this);

  // create the cylinders for the objects
  this.lineGeom = new THREE.CylinderGeometry(shaftRadius, shaftRadius, 1.0 - headLength);
  this.headGeom = new THREE.CylinderGeometry(0, headRadius, headLength);

  /**
   * Adds an axis marker to this axes object.
   *
   * @param axis - the 3D vector representing the axis to add
   */
  function addAxis(axis) {
    // set the color of the axis
    var color = new THREE.Color();
    color.setRGB(axis.x, axis.y, axis.z);
    var material = new THREE.MeshBasicMaterial({
      color : color.getHex()
    });

    // setup the rotation information
    var rotAxis = new THREE.Vector3();
    rotAxis.crossVectors(axis, new THREE.Vector3(0, -1, 0));
    var rot = new THREE.Quaternion();
    rot.setFromAxisAngle(rotAxis, 0.5 * Math.PI);

    // create the arrow
    var arrow = new THREE.Mesh(that.headGeom, material);
    arrow.position.copy(axis);
    arrow.position.multiplyScalar(0.95);
    arrow.quaternion.copy(rot);
    arrow.updateMatrix();
    that.add(arrow);

    // create the line
    var line = new THREE.Mesh(that.lineGeom, material);
    line.position.copy(axis);
    line.position.multiplyScalar(0.45);
    line.quaternion.copy(rot);
    line.updateMatrix();
    that.add(line);
  }

  // add the three markers to the axes
  addAxis(new THREE.Vector3(1, 0, 0));
  addAxis(new THREE.Vector3(0, 1, 0));
  addAxis(new THREE.Vector3(0, 0, 1));
};
ROS3D.Axes.prototype.__proto__ = THREE.Object3D.prototype;

/**
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * Create a grid object.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * num_cells (optional) - The number of cells of the grid
 *  * color (optional) - the line color of the grid, like '#cccccc'
 *  * lineWidth (optional) - the width of the lines in the grid
 *  * cellSize (optional) - The length, in meters, of the side of each cell
 */
ROS3D.Grid = function(options) {
  options = options || {};
  var num_cells = options.num_cells || 10;
  var color = options.color || '#cccccc';
  var lineWidth = options.lineWidth || 1;
  var cellSize = options.cellSize || 1;

  THREE.Object3D.call(this);

  var material = new THREE.LineBasicMaterial({
    color: color,
    linewidth: lineWidth
  });

  for (var i = 0; i <= num_cells; ++i) {
    var edge = cellSize * num_cells / 2;
    var position = edge - (i * cellSize);
    var geometryH = new THREE.Geometry();
    geometryH.vertices.push(
      new THREE.Vector3( -edge, position, 0 ),
      new THREE.Vector3( edge, position, 0 )
    );
    var geometryV = new THREE.Geometry();
    geometryV.vertices.push(
      new THREE.Vector3( position, -edge, 0 ),
      new THREE.Vector3( position, edge, 0 )
    );
    this.add(new THREE.Line(geometryH, material));
    this.add(new THREE.Line(geometryV, material));
  }
};

ROS3D.Grid.prototype.__proto__ = THREE.Object3D.prototype;

/**
 * @author Jihoon Lee - jihoonlee.in@gmail.com
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * A MeshResource is an THREE object that will load from a external mesh file. Currently loads
 * Collada files.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * path (optional) - the base path to the associated models that will be loaded
 *  * resource - the resource file name to load
 *  * material (optional) - the material to use for the object
 *  * warnings (optional) - if warnings should be printed
 */
ROS3D.MeshResource = function(options) {
  var that = this;
  options = options || {};
  var path = options.path || '/';
  var resource = options.resource;
  var material = options.material || null;
  this.warnings = options.warnings;
  this.state = 'loading';

  THREE.Object3D.call(this);

  // check for a trailing '/'
  if (path.substr(path.length - 1) !== '/') {
    path += '/';
  }

  var uri = path + resource;
  var fileType = uri.substr(-4).toLowerCase();

  // check the type
  var loader;
  if (fileType === '.dae') {
    loader = new THREE.ColladaLoader();
    loader.log = function(message) {
      if (that.warnings) {
        console.warn(message);
      }
    };
    loader.load(
      uri,
      function colladaReady(collada) {
        // check for a scale factor in ColladaLoader2
        // add a texture to anything that is missing one
        if(material !== null) {
          collada.scene.traverse(function(child) {
            if(child instanceof THREE.Mesh) {
              if(child.material === undefined) {
                child.material = material;
              }
            }
          });
        }

        that.add(collada.scene);
        that.state = 'finished';
      },
      /*onProgress=*/null,
      function onLoadError(error) {
  	that.state = 'error';
        console.error(error);
      });
  } else if (fileType === '.stl') {
    loader = new THREE.STLLoader();
    {
      loader.load(uri,
                  function ( geometry ) {
                    geometry.computeFaceNormals();
                    var mesh;
                      if(material !== null) {
                          mesh = new THREE.Mesh( geometry,  new THREE.MeshPhongMaterial( { ambient: 0x050505, color: 0xa2a2a2, specular: 0x555555, shininess: 1 } ) );
                      } else {
                          mesh = new THREE.Mesh( geometry,
                              new THREE.MeshPhongMaterial( { ambient: 0x050505, color: 0xa2a2a2, specular: 0x555555, shininess: 1 } ) );
                      }
                    that.add(mesh);
                    that.state = 'finished';
                  },
                  /*onProgress=*/null,
                  function onLoadError(error) {
                    that.state = 'error';
                    console.error(error);
                  });
    }
  } else {
    that.state = 'error';
  }
};
ROS3D.MeshResource.prototype.__proto__ = THREE.Object3D.prototype;

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * A TriangleList is a THREE object that can be used to display a list of triangles as a geometry.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * material (optional) - the material to use for the object
 *   * vertices - the array of vertices to use
 *   * colors - the associated array of colors to use
 */
ROS3D.TriangleList = function(options) {
  options = options || {};
  var material = options.material || new THREE.MeshBasicMaterial();
  var vertices = options.vertices;
  var colors = options.colors;

  THREE.Object3D.call(this);

  // set the material to be double sided
  material.side = THREE.DoubleSide;

  // construct the geometry
  var geometry = new THREE.Geometry();
  for (i = 0; i < vertices.length; i++) {
    geometry.vertices.push(new THREE.Vector3(vertices[i].x, vertices[i].y, vertices[i].z));
  }

  // set the colors
  var i, j;
  if (colors.length === vertices.length) {
    // use per-vertex color
    for (i = 0; i < vertices.length; i += 3) {
      var faceVert = new THREE.Face3(i, i + 1, i + 2);
      for (j = i * 3; j < i * 3 + 3; i++) {
        var color = new THREE.Color();
        color.setRGB(colors[i].r, colors[i].g, colors[i].b);
        faceVert.vertexColors.push(color);
      }
      geometry.faces.push(faceVert);
    }
    material.vertexColors = THREE.VertexColors;
  } else if (colors.length === vertices.length / 3) {
    // use per-triangle color
    for (i = 0; i < vertices.length; i += 3) {
      var faceTri = new THREE.Face3(i, i + 1, i + 2);
      faceTri.color.setRGB(colors[i / 3].r, colors[i / 3].g, colors[i / 3].b);
      geometry.faces.push(faceTri);
    }
    material.vertexColors = THREE.FaceColors;
  } else {
    // use marker color
    for (i = 0; i < vertices.length; i += 3) {
      var face = new THREE.Face3(i, i + 1, i + 2);
      geometry.faces.push(face);
    }
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeFaceNormals();

  this.add(new THREE.Mesh(geometry, material));
};
ROS3D.TriangleList.prototype.__proto__ = THREE.Object3D.prototype;

/**
 * Set the color of this object to the given hex value.
 *
 * @param hex - the hex value of the color to set
 */
ROS3D.TriangleList.prototype.setColor = function(hex) {
  this.mesh.material.color.setHex(hex);
};

/**
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * An OccupancyGrid can convert a ROS occupancy grid message into a THREE object.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * message - the occupancy grid message
 *   * color (optional) - color of the visualized grid
 *   * opacity (optional) - opacity of the visualized grid (0.0 == fully transparent, 1.0 == opaque)
 */
ROS3D.OccupancyGrid = function(options) {
  options = options || {};
  var message = options.message;
  var color = options.color || {r:255,g:255,b:255};
  var opacity = options.opacity || 1.0;

  // create the geometry
  var width = message.info.width;
  var height = message.info.height;
  var geom = new THREE.PlaneGeometry(width, height);

  // internal drawing canvas
  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var context = canvas.getContext('2d');
  // create the color material
  var imageData = context.createImageData(width, height);
  for ( var row = 0; row < height; row++) {
    for ( var col = 0; col < width; col++) {
      // determine the index into the map data
      var mapI = col + ((height - row - 1) * width);
      // determine the value
      var data = message.data[mapI];
      var val;
      if (data === 100) {
        val = 0;
      } else if (data === 0) {
        val = 255;
      } else {
        val = 127;
      }

      // determine the index into the image data array
      var i = (col + (row * width)) * 4;
      // r
      imageData.data[i] = (val * color.r) / 255;
      // g
      imageData.data[++i] = (val * color.g) / 255;
      // b
      imageData.data[++i] = (val * color.b) / 255;
      // a
      imageData.data[++i] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);

  var texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;

  var material = new THREE.MeshBasicMaterial({
    map : texture,
    transparent : opacity < 1.0,
    opacity : opacity
  });
  material.side = THREE.DoubleSide;

  // create the mesh
  THREE.Mesh.call(this, geom, material);
  // move the map so the corner is at X, Y and correct orientation (informations from message.info)
  this.quaternion = new THREE.Quaternion(
      message.info.origin.orientation.x,
      message.info.origin.orientation.y,
      message.info.origin.orientation.z,
      message.info.origin.orientation.w
  );
  this.position.x = (width * message.info.resolution) / 2 + message.info.origin.position.x;
  this.position.y = (height * message.info.resolution) / 2 + message.info.origin.position.y;
  this.position.z = message.info.origin.position.z;
  this.scale.x = message.info.resolution;
  this.scale.y = message.info.resolution;
};
ROS3D.OccupancyGrid.prototype.__proto__ = THREE.Mesh.prototype;

/**
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * An occupancy grid client that listens to a given map topic.
 *
 * Emits the following events:
 *
 *  * 'change' - there was an update or change in the marker
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic (optional) - the map topic to listen to
 *   * continuous (optional) - if the map should be continuously loaded (e.g., for SLAM)
 *   * tfClient (optional) - the TF client handle to use for a scene node
 *   * rootObject (optional) - the root object to add this marker to
 *   * offsetPose (optional) - offset pose of the grid visualization, e.g. for z-offset (ROSLIB.Pose type)
 *   * color (optional) - color of the visualized grid
 *   * opacity (optional) - opacity of the visualized grid (0.0 == fully transparent, 1.0 == opaque)
 */
ROS3D.OccupancyGridClient = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/map';
  this.continuous = options.continuous;
  this.tfClient = options.tfClient;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.offsetPose = options.offsetPose || new ROSLIB.Pose();
  this.color = options.color || {r:255,g:255,b:255};
  this.opacity = options.opacity || 1.0;

  // current grid that is displayed
  this.currentGrid = null;

  // subscribe to the topic
  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.OccupancyGridClient.prototype.__proto__ = EventEmitter2.prototype;

ROS3D.OccupancyGridClient.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.OccupancyGridClient.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : this.topicName,
    messageType : 'nav_msgs/OccupancyGrid',
    compression : 'png'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.OccupancyGridClient.prototype.processMessage = function(message){
  // check for an old map
  if (this.currentGrid) {
    // check if it there is a tf client
    if (this.currentGrid.tfClient) {
      // grid is of type ROS3D.SceneNode
      this.currentGrid.unsubscribeTf();
    }
    this.rootObject.remove(this.currentGrid);
  }

  var newGrid = new ROS3D.OccupancyGrid({
    message : message,
    color : this.color,
    opacity : this.opacity
  });

  // check if we care about the scene
  if (this.tfClient) {
    this.currentGrid = newGrid;
    this.sceneNode = new ROS3D.SceneNode({
      frameID : message.header.frame_id,
      tfClient : this.tfClient,
      object : newGrid,
      pose : this.offsetPose
    });
  } else {
    this.sceneNode = this.currentGrid = newGrid;
  }

  this.rootObject.add(this.sceneNode);

  this.emit('change');

  // check if we should unsubscribe
  if (!this.continuous) {
    this.rosTopic.unsubscribe();
  }
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 */

/**
 * An Odometry client
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the marker topic to listen to
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to
 *  * keep (optional) - number of markers to keep around (default: 1)
 *  * color (optional) - color for line (default: 0xcc00ff)
 *  * length (optional) - the length of the arrow (default: 1.0)
 *  * headLength (optional) - the head length of the arrow (default: 0.2)
 *  * shaftDiameter (optional) - the shaft diameter of the arrow (default: 0.05)
 *  * headDiameter (optional) - the head diameter of the arrow (default: 0.1)
 */
ROS3D.Odometry = function(options) {
  this.options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/particlecloud';
  this.tfClient = options.tfClient;
  this.color = options.color || 0xcc00ff;
  this.length = options.length || 1.0;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.keep = options.keep || 1;
  THREE.Object3D.call(this);

  this.sns = [];

  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.Odometry.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.Odometry.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.Odometry.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : this.topicName,
    messageType : 'nav_msgs/Odometry'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.Odometry.prototype.processMessage = function(message){
  if(this.sns.length >= this.keep) {
      this.sns[0].unsubscribeTf();
      this.rootObject.remove(this.sns[0]);
      this.sns.shift();
  }

  this.options.origin = new THREE.Vector3( message.pose.pose.position.x, message.pose.pose.position.y,
                                           message.pose.pose.position.z);

  var rot = new THREE.Quaternion(message.pose.pose.orientation.x, message.pose.pose.orientation.y,
                                 message.pose.pose.orientation.z, message.pose.pose.orientation.w);
  this.options.direction = new THREE.Vector3(1,0,0);
  this.options.direction.applyQuaternion(rot);
  this.options.material = new THREE.MeshBasicMaterial({color: this.color});
  var arrow = new ROS3D.Arrow(this.options);

  this.sns.push(new ROS3D.SceneNode({
    frameID : message.header.frame_id,
    tfClient : this.tfClient,
    object : arrow
  }));

  this.rootObject.add(this.sns[ this.sns.length - 1]);
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 */

/**
 * A Path client that listens to a given topic and displays a line connecting the poses.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the marker topic to listen to
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to
 *  * color (optional) - color for line (default: 0xcc00ff)
 */
ROS3D.Path = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/path';
  this.tfClient = options.tfClient;
  this.color = options.color || 0xcc00ff;
  this.rootObject = options.rootObject || new THREE.Object3D();
  THREE.Object3D.call(this);

  this.sn = null;
  this.line = null;

  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.Path.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.Path.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.Path.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
      ros : this.ros,
      name : this.topicName,
      messageType : 'nav_msgs/Path'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.Path.prototype.processMessage = function(message){
  if(this.sn!==null){
      this.sn.unsubscribeTf();
      this.rootObject.remove(this.sn);
  }

  var lineGeometry = new THREE.Geometry();
  for(var i=0; i<message.poses.length;i++){
      var v3 = new THREE.Vector3( message.poses[i].pose.position.x, message.poses[i].pose.position.y,
                                  message.poses[i].pose.position.z);
      lineGeometry.vertices.push(v3);
  }

  lineGeometry.computeLineDistances();
  var lineMaterial = new THREE.LineBasicMaterial( { color: this.color } );
  var line = new THREE.Line( lineGeometry, lineMaterial );

  this.sn = new ROS3D.SceneNode({
      frameID : message.header.frame_id,
      tfClient : this.tfClient,
      object : line
  });

  this.rootObject.add(this.sn);
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 */

/**
 * A PointStamped client
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the marker topic to listen to
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to
 *  * color (optional) - color for line (default: 0xcc00ff)
 *  * radius (optional) - radius of the point (default: 0.2)
 */
ROS3D.Point = function(options) {
  this.options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/point';
  this.tfClient = options.tfClient;
  this.color = options.color || 0xcc00ff;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.radius = options.radius || 0.2;
  THREE.Object3D.call(this);

  this.sn = null;

  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.Point.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.Point.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.Point.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
      ros : this.ros,
      name : this.topicName,
      messageType : 'geometry_msgs/PointStamped'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.Point.prototype.processMessage = function(message){
  if(this.sn!==null){
      this.sn.unsubscribeTf();
      this.rootObject.remove(this.sn);
  }

  var sphereGeometry = new THREE.SphereGeometry( this.radius );
  var sphereMaterial = new THREE.MeshBasicMaterial( {color: this.color} );
  var sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.set(message.point.x, message.point.y, message.point.z);

  this.sn = new ROS3D.SceneNode({
      frameID : message.header.frame_id,
      tfClient : this.tfClient,
      object : sphere
  });

  this.rootObject.add(this.sn);
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 */

/**
 * A PolygonStamped client that listens to a given topic and displays the polygon
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the marker topic to listen to
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to
 *  * color (optional) - color for line (default: 0xcc00ff)
 */
ROS3D.Polygon = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/path';
  this.tfClient = options.tfClient;
  this.color = options.color || 0xcc00ff;
  this.rootObject = options.rootObject || new THREE.Object3D();
  THREE.Object3D.call(this);

  this.sn = null;
  this.line = null;

  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.Polygon.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.Polygon.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.Polygon.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
      ros : this.ros,
      name : this.topicName,
      messageType : 'geometry_msgs/PolygonStamped'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.Polygon.prototype.processMessage = function(message){
  if(this.sn!==null){
      this.sn.unsubscribeTf();
      this.rootObject.remove(this.sn);
  }

  var lineGeometry = new THREE.Geometry();
  var v3;
  for(var i=0; i<message.polygon.points.length;i++){
      v3 = new THREE.Vector3( message.polygon.points[i].x, message.polygon.points[i].y,
                              message.polygon.points[i].z);
      lineGeometry.vertices.push(v3);
  }
  v3 = new THREE.Vector3( message.polygon.points[0].x, message.polygon.points[0].y,
                          message.polygon.points[0].z);
  lineGeometry.vertices.push(v3);
  lineGeometry.computeLineDistances();
  var lineMaterial = new THREE.LineBasicMaterial( { color: this.color } );
  var line = new THREE.Line( lineGeometry, lineMaterial );

  this.sn = new ROS3D.SceneNode({
      frameID : message.header.frame_id,
      tfClient : this.tfClient,
      object : line
  });

  this.rootObject.add(this.sn);
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 */

/**
 * A PoseStamped client
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the marker topic to listen to
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to
 *  * color (optional) - color for line (default: 0xcc00ff)
 *  * length (optional) - the length of the arrow (default: 1.0)
 *  * headLength (optional) - the head length of the arrow (default: 0.2)
 *  * shaftDiameter (optional) - the shaft diameter of the arrow (default: 0.05)
 *  * headDiameter (optional) - the head diameter of the arrow (default: 0.1)
 */
ROS3D.Pose = function(options) {
  this.options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/pose';
  this.tfClient = options.tfClient;
  this.color = options.color || 0xcc00ff;
  this.rootObject = options.rootObject || new THREE.Object3D();
  THREE.Object3D.call(this);

  this.sn = null;

  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.Pose.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.Pose.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.Pose.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
      ros : this.ros,
      name : this.topicName,
      messageType : 'geometry_msgs/PoseStamped'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.Pose.prototype.processMessage = function(message){
  if(this.sn!==null){
      this.sn.unsubscribeTf();
      this.rootObject.remove(this.sn);
  }

  this.options.origin = new THREE.Vector3( message.pose.position.x, message.pose.position.y,
                                           message.pose.position.z);

  var rot = new THREE.Quaternion(message.pose.orientation.x, message.pose.orientation.y,
                                 message.pose.orientation.z, message.pose.orientation.w);
  this.options.direction = new THREE.Vector3(1,0,0);
  this.options.direction.applyQuaternion(rot);
  this.options.material = new THREE.MeshBasicMaterial({color: this.color});
  var arrow = new ROS3D.Arrow(this.options);

  this.sn = new ROS3D.SceneNode({
      frameID : message.header.frame_id,
      tfClient : this.tfClient,
      object : arrow
  });

  this.rootObject.add(this.sn);
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 */

/**
 * A PoseArray client
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the marker topic to listen to
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to
 *  * color (optional) - color for line (default: 0xcc00ff)
 *  * length (optional) - the length of the arrow (default: 1.0)
 */
ROS3D.PoseArray = function(options) {
  this.options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/particlecloud';
  this.tfClient = options.tfClient;
  this.color = options.color || 0xcc00ff;
  this.length = options.length || 1.0;
  this.rootObject = options.rootObject || new THREE.Object3D();
  THREE.Object3D.call(this);

  this.sn = null;

  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.PoseArray.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.PoseArray.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.PoseArray.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
     ros : this.ros,
     name : this.topicName,
     messageType : 'geometry_msgs/PoseArray'
 });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.PoseArray.prototype.processMessage = function(message){
  if(this.sn!==null){
      this.sn.unsubscribeTf();
      this.rootObject.remove(this.sn);
  }

  var group = new THREE.Object3D();
  var line;

  for(var i=0;i<message.poses.length;i++){
      var lineGeometry = new THREE.Geometry();

      var v3 = new THREE.Vector3( message.poses[i].position.x, message.poses[i].position.y,
                                  message.poses[i].position.z);
      lineGeometry.vertices.push(v3);

      var rot = new THREE.Quaternion(message.poses[i].orientation.x, message.poses[i].orientation.y,
                                     message.poses[i].orientation.z, message.poses[i].orientation.w);

      var tip = new THREE.Vector3(this.length,0,0);
      var side1 = new THREE.Vector3(this.length*0.8, this.length*0.2, 0);
      var side2 = new THREE.Vector3(this.length*0.8, -this.length*0.2, 0);
      tip.applyQuaternion(rot);
      side1.applyQuaternion(rot);
      side2.applyQuaternion(rot);

      lineGeometry.vertices.push(tip.add(v3));
      lineGeometry.vertices.push(side1.add(v3));
      lineGeometry.vertices.push(side2.add(v3));
      lineGeometry.vertices.push(tip);

      lineGeometry.computeLineDistances();
      var lineMaterial = new THREE.LineBasicMaterial( { color: this.color } );
      line = new THREE.Line( lineGeometry, lineMaterial );

      group.add(line);
  }

  this.sn = new ROS3D.SceneNode({
      frameID : message.header.frame_id,
      tfClient : this.tfClient,
      object : group
  });

  this.rootObject.add(this.sn);
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 */

/**
 * A PoseWithCovarianceStamped client
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the marker topic to listen to
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to
 *  * color (optional) - color for line (default: 0xcc00ff)
 */
ROS3D.PoseWithCovariance = function(options) {
  this.options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/PoseWithCovariance';
  this.tfClient = options.tfClient;
  this.color = options.color || 0xcc00ff;
  this.rootObject = options.rootObject || new THREE.Object3D();
  THREE.Object3D.call(this);

  this.sn = null;

  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.PoseWithCovariance.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.PoseWithCovariance.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.PoseWithCovariance.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
      ros : this.ros,
      name : this.topicName,
      messageType : 'geometry_msgs/PoseWithCovarianceStamped'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.PoseWithCovariance.prototype.processMessage = function(message){
  if(this.sn!==null){
      this.sn.unsubscribeTf();
      this.rootObject.remove(this.sn);
  }

  this.options.origin = new THREE.Vector3( message.pose.pose.position.x, message.pose.pose.position.y,
                                           message.pose.pose.position.z);

  var rot = new THREE.Quaternion(message.pose.pose.orientation.x, message.pose.pose.orientation.y,
                                 message.pose.pose.orientation.z, message.pose.pose.orientation.w);
  this.options.direction = new THREE.Vector3(1,0,0);
  this.options.direction.applyQuaternion(rot);
  this.options.material = new THREE.MeshBasicMaterial({color: this.color});
  var arrow = new ROS3D.Arrow(this.options);

  this.sn = new ROS3D.SceneNode({
      frameID : message.header.frame_id,
      tfClient : this.tfClient,
      object : arrow
  });

  this.rootObject.add(this.sn);
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 */

/**
 * A LaserScan client that listens to a given topic and displays the points.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the marker topic to listen to (default '/scan')
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to use for the points.
 *  * max_pts (optional) - number of points to draw (default: 10000)
 *  * pointRatio (optional) - point subsampling ratio (default: 1, no subsampling)
 *  * messageRatio (optional) - message subsampling ratio (default: 1, no subsampling)
 *  * material (optional) - a material object or an option to construct a PointsMaterial.
 */
ROS3D.LaserScan = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/scan';
  this.points = new ROS3D.Points(options);
  this.rosTopic = undefined;
  this.subscribe();

};
ROS3D.LaserScan.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.LaserScan.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.LaserScan.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : this.topicName,
    messageType : 'sensor_msgs/LaserScan'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.LaserScan.prototype.processMessage = function(message){
  if(!this.points.setup(message.header.frame_id)) {
      return;
  }
  var n = message.ranges.length;
  var j = 0;
  for(var i=0;i<n;i+=this.points.pointRatio){
    var range = message.ranges[i];
    if(range >= message.range_min && range <= message.range_max){
        var angle = message.angle_min + i * message.angle_increment;
        this.points.positions.array[j++] = range * Math.cos(angle);
        this.points.positions.array[j++] = range * Math.sin(angle);
        this.points.positions.array[j++] = 0.0;
    }
  }
  this.points.update(j/3);
};

/**
 * @author Mathieu Bredif - mathieu.bredif@ign.fr
 */

/**
 * A NavSatFix client that listens to a given topic and displays a line connecting the gps fixes.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the NavSatFix topic to listen to
 *  * rootObject (optional) - the root object to add the trajectory line and the gps marker to
 *  * object3d (optional) - the object3d to be translated by the gps position
 *  * material (optional) - THREE.js material or options passed to a THREE.LineBasicMaterial, such as :
 *    * material.color (optional) - color for line
 *    * material.linewidth (optional) - line width
 *  * altitudeNaN (optional) - default altitude when the message altitude is NaN (default: 0)
 *  * keep (optional) - number of gps fix points to keep (default: 100)
 *  * convert (optional) - conversion function from lon/lat/alt to THREE.Vector3 (default: passthrough)
 */

ROS3D.NavSatFix = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/gps/fix';
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.object3d = options.object3d || new THREE.Object3D();
  var material = options.material || {};
  this.altitudeNaN = options.altitudeNaN || 0;
  this.keep = options.keep || 100;
  this.convert = options.convert || function(lon,lat,alt) { return new THREE.Vector3(lon,lat,alt); };
  this.count = 0;
  this.next1 = 0;
  this.next2 = this.keep;

  this.geom = new THREE.BufferGeometry();
  this.vertices = new THREE.BufferAttribute(new Float32Array( 6 * this.keep ), 3 );
  this.geom.addAttribute( 'position',  this.vertices);
  this.material = material.isMaterial ? material : new THREE.LineBasicMaterial( material );
  this.line = new THREE.Line( this.geom, this.material );
  this.rootObject.add(this.object3d);
  this.rootObject.add(this.line);

  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.NavSatFix.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.NavSatFix.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.NavSatFix.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
      ros : this.ros,
      name : this.topicName,
      messageType : 'sensor_msgs/NavSatFix'
  });

  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.NavSatFix.prototype.processMessage = function(message){
  var altitude = isNaN(message.altitude) ? this.altitudeNaN : message.altitude;
  var p = this.convert(message.longitude, message.latitude, altitude);

  // move the object3d to the gps position
  this.object3d.position.copy(p);
  this.object3d.updateMatrixWorld(true);

  // copy the position twice in the circular buffer
  // the second half replicates the first to allow a single drawRange
  this.vertices.array[3*this.next1  ] = p.x;
  this.vertices.array[3*this.next1+1] = p.y;
  this.vertices.array[3*this.next1+2] = p.z;
  this.vertices.array[3*this.next2  ] = p.x;
  this.vertices.array[3*this.next2+1] = p.y;
  this.vertices.array[3*this.next2+2] = p.z;
  this.vertices.needsUpdate = true;

  this.next1 = (this.next1+1) % this.keep;
  this.next2 = this.next1 + this.keep;
  this.count = Math.min(this.count+1, this.keep);
  this.geom.setDrawRange(this.next2-this.count, this.count );
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 * @author Mathieu Bredif - mathieu.bredif@ign.fr
 */

/**
 * Decodes the base64-encoded array 'inbytes' into the array 'outbytes'
 * until 'inbytes' is exhausted or 'outbytes' is filled.
 * if 'record_size' is specified, records of length 'record_size' bytes
 * are copied every other 'pointRatio' records.
 * returns the number of decoded records
 */
function decode64(inbytes, outbytes, record_size, pointRatio) {
    var x,b=0,l=0,j=0,L=inbytes.length,A=outbytes.length;
    record_size = record_size || A; // default copies everything (no skipping)
    pointRatio = pointRatio || 1; // default copies everything (no skipping)
    var bitskip = (pointRatio-1) * record_size * 8;
    for(x=0;x<L&&j<A;x++){
        b=(b<<6)+decode64.e[inbytes.charAt(x)];
        l+=6;
        if(l>=8){
            l-=8;
            outbytes[j++]=(b>>>l)&0xff;
            if((j % record_size) === 0) { // skip records
                // no    optimization: for(var i=0;i<bitskip;x++){l+=6;if(l>=8) {l-=8;i+=8;}}
                // first optimization: for(;l<bitskip;l+=6){x++;} l=l%8;
                x += Math.ceil((bitskip - l) / 6);
                l = l % 8;

                if(l>0){b=decode64.e[inbytes.charAt(x)];}
            }
        }
    }
    return Math.floor(j/record_size);
}
// initialize decoder with static lookup table 'e'
decode64.S='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
decode64.e={};
for(var i=0;i<64;i++){decode64.e[decode64.S.charAt(i)]=i;}


/**
 * A PointCloud2 client that listens to a given topic and displays the points.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * ros - the ROSLIB.Ros connection handle
 *  * topic - the marker topic to listen to (default: '/points')
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to use for the points.
 *  * max_pts (optional) - number of points to draw (default: 10000)
 *  * pointRatio (optional) - point subsampling ratio (default: 1, no subsampling)
 *  * messageRatio (optional) - message subsampling ratio (default: 1, no subsampling)
 *  * material (optional) - a material object or an option to construct a PointsMaterial.
 *  * colorsrc (optional) - the field to be used for coloring (default: 'rgb')
 *  * colormap (optional) - function that turns the colorsrc field value to a color
 */
ROS3D.PointCloud2 = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic || '/points';
  this.points = new ROS3D.Points(options);
  this.rosTopic = undefined;
  this.subscribe();
};
ROS3D.PointCloud2.prototype.__proto__ = THREE.Object3D.prototype;


ROS3D.PointCloud2.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.PointCloud2.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : this.topicName,
    messageType : 'sensor_msgs/PointCloud2'
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.PointCloud2.prototype.processMessage = function(msg){
  if(!this.points.setup(msg.header.frame_id, msg.point_step, msg.fields)) {
      return;
  }

  var n, pointRatio = this.points.pointRatio;

  if (msg.data.buffer) {
    this.points.buffer = msg.data.buffer;
    n = msg.height*msg.width / pointRatio;
  } else {
    n = decode64(msg.data, this.points.buffer, msg.point_step, pointRatio);
    pointRatio = 1;
  }

  var dv = new DataView(this.points.buffer.buffer);
  var littleEndian = !msg.is_bigendian;
  var x = this.points.fields.x.offset;
  var y = this.points.fields.y.offset;
  var z = this.points.fields.z.offset;
  var base, color;
  for(var i = 0; i < n; i++){
    base = i * pointRatio * msg.point_step;
    this.points.positions.array[3*i    ] = dv.getFloat32(base+x, littleEndian);
    this.points.positions.array[3*i + 1] = dv.getFloat32(base+y, littleEndian);
    this.points.positions.array[3*i + 2] = dv.getFloat32(base+z, littleEndian);

    if(this.points.colors){
        color = this.points.colormap(this.points.getColor(dv,base,littleEndian));
        this.points.colors.array[3*i    ] = color.r;
        this.points.colors.array[3*i + 1] = color.g;
        this.points.colors.array[3*i + 2] = color.b;
    }
  }
  this.points.update(n);
};

/**
 * @author David V. Lu!! - davidvlu@gmail.com
 * @author Mathieu Bredif - mathieu.bredif@ign.fr
 */

/**
 * A set of points. Used by PointCloud2 and LaserScan.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * tfClient - the TF client handle to use
 *  * rootObject (optional) - the root object to add this marker to use for the points.
 *  * max_pts (optional) - number of points to draw (default: 10000)
 *  * pointRatio (optional) - point subsampling ratio (default: 1, no subsampling)
 *  * messageRatio (optional) - message subsampling ratio (default: 1, no subsampling)
 *  * material (optional) - a material object or an option to construct a PointsMaterial.
 *  * colorsrc (optional) - the field to be used for coloring (default: 'rgb')
 *  * colormap (optional) - function that turns the colorsrc field value to a color
 */
ROS3D.Points = function(options) {
  options = options || {};
  this.tfClient = options.tfClient;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.max_pts = options.max_pts || 10000;
  this.pointRatio = options.pointRatio || 1;
  this.messageRatio = options.messageRatio || 1;
  this.messageCount = 0;
  this.material = options.material || {};
  this.colorsrc = options.colorsrc;
  this.colormap = options.colormap;
  THREE.Object3D.call(this);

  if(('color' in options) || ('size' in options) || ('texture' in options)) {
      console.warn(
        'toplevel "color", "size" and "texture" options are deprecated.' +
        'They should beprovided within a "material" option, e.g. : '+
        ' { tfClient, material : { color: mycolor, size: mysize, map: mytexture }, ... }'
      );
  }

  this.sn = null;
  this.buffer = null;
};

ROS3D.Points.prototype.setup = function(frame, point_step, fields)
{
    if(this.sn===null){
        // scratch space to decode base64 buffers
        if(point_step) {
            this.buffer = new Uint8Array( this.max_pts * point_step );
        }
        // turn fields to a map
        fields = fields || [];
        this.fields = {};
        for(var i=0; i<fields.length; i++) {
            this.fields[fields[i].name] = fields[i];
        }
        this.geom = new THREE.BufferGeometry();

        this.positions = new THREE.BufferAttribute( new Float32Array( this.max_pts * 3), 3, false );
        this.geom.addAttribute( 'position', this.positions.setDynamic(true) );

        if(!this.colorsrc && this.fields.rgb) {
            this.colorsrc = 'rgb';
        }
        if(this.colorsrc) {
            var field = this.fields[this.colorsrc];
            if (field) {
                this.colors = new THREE.BufferAttribute( new Float32Array( this.max_pts * 3), 3, false );
                this.geom.addAttribute( 'color', this.colors.setDynamic(true) );
                var offset = field.offset;
                this.getColor = [
                    function(dv,base,le){return dv.getInt8(base+offset,le);},
                    function(dv,base,le){return dv.getUint8(base+offset,le);},
                    function(dv,base,le){return dv.getInt16(base+offset,le);},
                    function(dv,base,le){return dv.getUint16(base+offset,le);},
                    function(dv,base,le){return dv.getInt32(base+offset,le);},
                    function(dv,base,le){return dv.getUint32(base+offset,le);},
                    function(dv,base,le){return dv.getFloat32(base+offset,le);},
                    function(dv,base,le){return dv.getFloat64(base+offset,le);}
                ][field.datatype-1];
                this.colormap = this.colormap || function(x){return new THREE.Color(x);};
            } else {
                console.warn('unavailable field "' + this.colorsrc + '" for coloring.');
            }
        }

        if(!this.material.isMaterial) { // if it is an option, apply defaults and pass it to a PointsMaterial
            if(this.colors && this.material.vertexColors === undefined) {
                this.material.vertexColors = THREE.VertexColors;
            }
            this.material = new THREE.PointsMaterial(this.material);      
        }

        this.object = new THREE.Points( this.geom, this.material );

        this.sn = new ROS3D.SceneNode({
            frameID : frame,
            tfClient : this.tfClient,
            object : this.object
        });

        this.rootObject.add(this.sn);
    }
    return (this.messageCount++ % this.messageRatio) === 0;
};

ROS3D.Points.prototype.update = function(n)
{
  this.geom.setDrawRange(0,n);

  this.positions.needsUpdate = true;
  this.positions.updateRange.count = n * this.positions.itemSize;

  if (this.colors) {
    this.colors.needsUpdate = true;
    this.colors.updateRange.count = n * this.colors.itemSize;
  }
};

/**
 * @author Jihoon Lee - jihoonlee.in@gmail.com
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * A URDF can be used to load a ROSLIB.UrdfModel and its associated models into a 3D object.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * urdfModel - the ROSLIB.UrdfModel to load
 *   * tfClient - the TF client handle to use
 *   * path (optional) - the base path to the associated Collada models that will be loaded
 *   * tfPrefix (optional) - the TF prefix to used for multi-robots
 *   * loader (optional) - the Collada loader to use (e.g., an instance of ROS3D.COLLADA_LOADER
 *                         ROS3D.COLLADA_LOADER_2) -- defaults to ROS3D.COLLADA_LOADER_2
 */
ROS3D.Urdf = function(options) {
  options = options || {};
  var urdfModel = options.urdfModel;
  var path = options.path || '/';
  var tfClient = options.tfClient;
  var tfPrefix = options.tfPrefix || '';
  var loader = options.loader || ROS3D.COLLADA_LOADER_2;

  THREE.Object3D.call(this);

  // load all models
  var links = urdfModel.links;
  for ( var l in links) {
    var link = links[l];
    for( var i=0; i<link.visuals.length; i++ ) {
      var visual = link.visuals[i];
      if (visual && visual.geometry) {
        // Save frameID
        var frameID = tfPrefix + '/' + link.name;
        // Save color material
        var colorMaterial = null;
        if (visual.material && visual.material.color) {
          var color = visual.material && visual.material.color;
          colorMaterial = ROS3D.makeColorMaterial(color.r, color.g, color.b, color.a);
        }
        if (visual.geometry.type === ROSLIB.URDF_MESH) {
          var uri = visual.geometry.filename;
          // strips package://
          var tmpIndex = uri.indexOf('package://');
          if (tmpIndex !== -1) {
            uri = uri.substr(tmpIndex + ('package://').length);
          }
          var fileType = uri.substr(-4).toLowerCase();

          // ignore mesh files which are not in Collada or STL format
          if (fileType === '.dae' || fileType === '.stl') {
            // create the model
            var mesh = new ROS3D.MeshResource({
              path : path,
              resource : uri,
              loader : loader,
              material : colorMaterial
            });

            // check for a scale
            if(link.visuals[i].geometry.scale) {
              mesh.scale.copy(visual.geometry.scale);
            }

            // create a scene node with the model
            var sceneNode = new ROS3D.SceneNode({
              frameID : frameID,
                pose : visual.origin,
                tfClient : tfClient,
                object : mesh
            });
            this.add(sceneNode);
          } else {
            console.warn('Could not load geometry mesh: '+uri);
          }
        } else {
          if (!colorMaterial) {
            colorMaterial = ROS3D.makeColorMaterial(0, 0, 0, 1);
          }
          var shapeMesh;
          // Create a shape
          switch (visual.geometry.type) {
            case ROSLIB.URDF_BOX:
              var dimension = visual.geometry.dimension;
              var cube = new THREE.BoxGeometry(dimension.x, dimension.y, dimension.z);
              shapeMesh = new THREE.Mesh(cube, colorMaterial);
              break;
            case ROSLIB.URDF_CYLINDER:
              var radius = visual.geometry.radius;
              var length = visual.geometry.length;
              var cylinder = new THREE.CylinderGeometry(radius, radius, length, 16, 1, false);
              shapeMesh = new THREE.Mesh(cylinder, colorMaterial);
              shapeMesh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI * 0.5);
              break;
            case ROSLIB.URDF_SPHERE:
              var sphere = new THREE.SphereGeometry(visual.geometry.radius, 16);
              shapeMesh = new THREE.Mesh(sphere, colorMaterial);
              break;
          }
          // Create a scene node with the shape
          var scene = new ROS3D.SceneNode({
            frameID: frameID,
              pose: visual.origin,
              tfClient: tfClient,
              object: shapeMesh
          });
          this.add(scene);
        }
      }
    }
  }
};
ROS3D.Urdf.prototype.__proto__ = THREE.Object3D.prototype;

ROS3D.Urdf.prototype.unsubscribeTf = function () {
  this.children.forEach(function(n) {
    if (typeof n.unsubscribeTf === 'function') { n.unsubscribeTf(); }
  });
};

/**
 * @author Jihoon Lee - jihoonlee.in@gmail.com
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * A URDF client can be used to load a URDF and its associated models into a 3D object from the ROS
 * parameter server.
 *
 * Emits the following events:
 *
 * * 'change' - emited after the URDF and its meshes have been loaded into the root object
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * ros - the ROSLIB.Ros connection handle
 *   * param (optional) - the paramter to load the URDF from, like 'robot_description'
 *   * tfClient - the TF client handle to use
 *   * path (optional) - the base path to the associated Collada models that will be loaded
 *   * rootObject (optional) - the root object to add this marker to
 *   * tfPrefix (optional) - the TF prefix to used for multi-robots
 *   * loader (optional) - the Collada loader to use (e.g., an instance of ROS3D.COLLADA_LOADER
 *                         ROS3D.COLLADA_LOADER_2) -- defaults to ROS3D.COLLADA_LOADER_2
 */
ROS3D.UrdfClient = function(options) {
  var that = this;
  options = options || {};
  var ros = options.ros;
  this.param = options.param || 'robot_description';
  this.path = options.path || '/';
  this.tfClient = options.tfClient;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.tfPrefix = options.tfPrefix || '';
  this.loader = options.loader || ROS3D.COLLADA_LOADER_2;

  // get the URDF value from ROS
  var getParam = new ROSLIB.Param({
    ros : ros,
    name : this.param
  });
  getParam.get(function(string) {
    // hand off the XML string to the URDF model
    var urdfModel = new ROSLIB.UrdfModel({
      string : string
    });

    // load all models
    that.urdf = new ROS3D.Urdf({
      urdfModel : urdfModel,
      path : that.path,
      tfClient : that.tfClient,
      tfPrefix : that.tfPrefix,
      loader : that.loader
    });
    that.rootObject.add(that.urdf);
  });
};

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * A mouseover highlighter for 3D objects in the scene.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * mouseHandler - the handler for the mouseover and mouseout events
 */
ROS3D.Highlighter = function(options) {
  options = options || {};
  this.mouseHandler = options.mouseHandler;
  this.hoverObjs = {};

  // bind the mouse events
  this.mouseHandler.addEventListener('mouseover', this.onMouseOver.bind(this));
  this.mouseHandler.addEventListener('mouseout', this.onMouseOut.bind(this));
};

/**
 * Add the current target of the mouseover to the hover list.
 *
 * @param event - the event that contains the target of the mouseover
 */
ROS3D.Highlighter.prototype.onMouseOver = function(event) {
  this.hoverObjs[event.currentTarget.uuid] = event.currentTarget;
};

/**
 * Remove the current target of the mouseover from the hover list.
 *
 * @param event - the event that contains the target of the mouseout
 */
ROS3D.Highlighter.prototype.onMouseOut = function(event) {
  var uuid = event.currentTarget.uuid;
  if (uuid in this.hoverObjs)
  {
    delete this.hoverObjs[uuid];
  }
};


/**
 * Render the highlights for all objects that are currently highlighted.
 *
 * This method should be executed after clearing the renderer and
 * rendering the regular scene.
 *
 * @param scene - the current scene, which should contain the highlighted objects (among others)
 * @param renderer - the renderer used to render the scene.
 * @param camera - the scene's camera
 */
ROS3D.Highlighter.prototype.renderHighlights = function(scene, renderer, camera) {

  // Render highlights by making everything but the highlighted
  // objects invisible...
  this.makeEverythingInvisible(scene);
  this.makeHighlightedVisible(scene);

  // Providing a transparent overrideMaterial...
  var originalOverrideMaterial = scene.overrideMaterial;
  scene.overrideMaterial = new THREE.MeshBasicMaterial({
      fog : false,
      opacity : 0.5,
      transparent : true,
      depthTest : true,
      depthWrite : false,
      polygonOffset : true,
      polygonOffsetUnits : -1,
      side : THREE.DoubleSide
  });

  // And then rendering over the regular scene
  renderer.render(scene, camera);

  // Finally, restore the original overrideMaterial (if any) and
  // object visibility.
  scene.overrideMaterial = originalOverrideMaterial;
  this.restoreVisibility(scene);
};


/**
 * Traverses the given object and makes every object that's a Mesh,
 * Line or Sprite invisible. Also saves the previous visibility state
 * so we can restore it later.
 *
 * @param scene - the object to traverse
 */
ROS3D.Highlighter.prototype.makeEverythingInvisible = function (scene) {
  scene.traverse(function(currentObject) {
    if ( currentObject instanceof THREE.Mesh || currentObject instanceof THREE.Line
         || currentObject instanceof THREE.Sprite ) {
      currentObject.previousVisibility = currentObject.visible;
      currentObject.visible = false;
    }
  });
};


/**
 * Make the objects in the scene that are currently highlighted (and
 * all of their children!) visible.
 *
 * @param scene - the object to traverse
 */
ROS3D.Highlighter.prototype.makeHighlightedVisible = function (scene) {
  var makeVisible = function(currentObject) {
      if ( currentObject instanceof THREE.Mesh || currentObject instanceof THREE.Line
           || currentObject instanceof THREE.Sprite ) {
        currentObject.visible = true;
      }
  };

  for (var uuid in this.hoverObjs) {
    var selectedObject = this.hoverObjs[uuid];
    // Make each selected object and all of its children visible
    selectedObject.visible = true;
    selectedObject.traverse(makeVisible);
  }
};

/**
 * Restore the old visibility state that was saved by
 * makeEverythinginvisible.
 *
 * @param scene - the object to traverse
 */
ROS3D.Highlighter.prototype.restoreVisibility = function (scene) {
  scene.traverse(function(currentObject) {
    if (currentObject.hasOwnProperty('previousVisibility')) {
      currentObject.visible = currentObject.previousVisibility;
    }
  }.bind(this));
};

/**
 * @author David Gossow - dgossow@willowgarage.com
 */

/**
 * A handler for mouse events within a 3D viewer.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * renderer - the main renderer
 *   * camera - the main camera in the scene
 *   * rootObject - the root object to check for mouse events
 *   * fallbackTarget - the fallback target, e.g., the camera controls
 */
ROS3D.MouseHandler = function(options) {
  THREE.EventDispatcher.call(this);
  this.renderer = options.renderer;
  this.camera = options.camera;
  this.rootObject = options.rootObject;
  this.fallbackTarget = options.fallbackTarget;
  this.lastTarget = this.fallbackTarget;
  this.dragging = false;

  // listen to DOM events
  var eventNames = [ 'contextmenu', 'click', 'dblclick', 'mouseout', 'mousedown', 'mouseup',
      'mousemove', 'mousewheel', 'DOMMouseScroll', 'touchstart', 'touchend', 'touchcancel',
      'touchleave', 'touchmove' ];
  this.listeners = {};

  // add event listeners for the associated mouse events
  eventNames.forEach(function(eventName) {
    this.listeners[eventName] = this.processDomEvent.bind(this);
    this.renderer.domElement.addEventListener(eventName, this.listeners[eventName], false);
  }, this);
};

/**
 * Process the particular DOM even that has occurred based on the mouse's position in the scene.
 *
 * @param domEvent - the DOM event to process
 */
ROS3D.MouseHandler.prototype.processDomEvent = function(domEvent) {
  // don't deal with the default handler
  domEvent.preventDefault();

  // compute normalized device coords and 3D mouse ray
  var target = domEvent.target;
  var rect = target.getBoundingClientRect();
  var pos_x, pos_y;

  if(domEvent.type.indexOf('touch') !== -1) {
    pos_x = 0;
    pos_y = 0;
    for(var i=0; i<domEvent.touches.length; ++i) {
        pos_x += domEvent.touches[i].clientX;
        pos_y += domEvent.touches[i].clientY;
    }
    pos_x /= domEvent.touches.length;
    pos_y /= domEvent.touches.length;
  }
  else {
	pos_x = domEvent.clientX;
	pos_y = domEvent.clientY;
  }
  var left = pos_x - rect.left - target.clientLeft + target.scrollLeft;
  var top = pos_y - rect.top - target.clientTop + target.scrollTop;
  var deviceX = left / target.clientWidth * 2 - 1;
  var deviceY = -top / target.clientHeight * 2 + 1;
  var vector = new THREE.Vector3(deviceX, deviceY, 0.5);
  vector.unproject(this.camera);
  // use the THREE raycaster
  var mouseRaycaster = new THREE.Raycaster(this.camera.position.clone(), vector.sub(
      this.camera.position).normalize());
  mouseRaycaster.linePrecision = 0.001;
  var mouseRay = mouseRaycaster.ray;

  // make our 3d mouse event
  var event3D = {
    mousePos : new THREE.Vector2(deviceX, deviceY),
    mouseRay : mouseRay,
    domEvent : domEvent,
    camera : this.camera,
    intersection : this.lastIntersection
  };

  // if the mouse leaves the dom element, stop everything
  if (domEvent.type === 'mouseout') {
    if (this.dragging) {
      this.notify(this.lastTarget, 'mouseup', event3D);
      this.dragging = false;
    }
    this.notify(this.lastTarget, 'mouseout', event3D);
    this.lastTarget = null;
    return;
  }

  // if the touch leaves the dom element, stop everything
  if (domEvent.type === 'touchleave' || domEvent.type === 'touchend') {
    if (this.dragging) {
      this.notify(this.lastTarget, 'mouseup', event3D);
      this.dragging = false;
    }
    this.notify(this.lastTarget, 'touchend', event3D);
    this.lastTarget = null;
    return;
  }

  // while the user is holding the mouse down, stay on the same target
  if (this.dragging) {
    this.notify(this.lastTarget, domEvent.type, event3D);
    // for check for right or left mouse button
    if ((domEvent.type === 'mouseup' && domEvent.button === 2) || domEvent.type === 'click' || domEvent.type === 'touchend') {
      this.dragging = false;
    }
    return;
  }

  // in the normal case, we need to check what is under the mouse
  target = this.lastTarget;
  var intersections = [];
  intersections = mouseRaycaster.intersectObject(this.rootObject, true);

  if (intersections.length > 0) {
    target = intersections[0].object;
    event3D.intersection = this.lastIntersection = intersections[0];
  } else {
    target = this.fallbackTarget;
  }

  // if the mouse moves from one object to another (or from/to the 'null' object), notify both
  if (target !== this.lastTarget && domEvent.type.match(/mouse/)) {

    // Event Status. TODO: Make it as enum
    // 0: Accepted
    // 1: Failed
    // 2: Continued
    var eventStatus = this.notify(target, 'mouseover', event3D);
    if (eventStatus === 0) {
      this.notify(this.lastTarget, 'mouseout', event3D);
    } else if(eventStatus === 1) {
      // if target was null or no target has caught our event, fall back
      target = this.fallbackTarget;
      if (target !== this.lastTarget) {
        this.notify(target, 'mouseover', event3D);
        this.notify(this.lastTarget, 'mouseout', event3D);
      }
    }
  }

  // if the finger moves from one object to another (or from/to the 'null' object), notify both
  if (target !== this.lastTarget && domEvent.type.match(/touch/)) {
    var toucheventAccepted = this.notify(target, domEvent.type, event3D);
    if (toucheventAccepted) {
      this.notify(this.lastTarget, 'touchleave', event3D);
      this.notify(this.lastTarget, 'touchend', event3D);
    } else {
      // if target was null or no target has caught our event, fall back
      target = this.fallbackTarget;
      if (target !== this.lastTarget) {
        this.notify(this.lastTarget, 'touchmove', event3D);
        this.notify(this.lastTarget, 'touchend', event3D);
      }
    }
  }

  // pass through event
  this.notify(target, domEvent.type, event3D);
  if (domEvent.type === 'mousedown' || domEvent.type === 'touchstart' || domEvent.type === 'touchmove') {
    this.dragging = true;
  }
  this.lastTarget = target;
};

/**
 * Notify the listener of the type of event that occurred.
 *
 * @param target - the target of the event
 * @param type - the type of event that occurred
 * @param event3D - the 3D mouse even information
 * @returns if an event was canceled
 */
ROS3D.MouseHandler.prototype.notify = function(target, type, event3D) {
  // ensure the type is set
  //
  event3D.type = type;

  // make the event cancelable
  event3D.cancelBubble = false;
  event3D.continueBubble = false;
  event3D.stopPropagation = function() {
    event3D.cancelBubble = true;
  };

  // it hit the selectable object but don't highlight
  event3D.continuePropagation = function () {
    event3D.continueBubble = true;
  };

  // walk up graph until event is canceled or root node has been reached
  event3D.currentTarget = target;

  while (event3D.currentTarget) {
    // try to fire event on object
    if (event3D.currentTarget.dispatchEvent
        && event3D.currentTarget.dispatchEvent instanceof Function) {
      event3D.currentTarget.dispatchEvent(event3D);
      if (event3D.cancelBubble) {
        this.dispatchEvent(event3D);
        return 0; // Event Accepted
      }
      else if(event3D.continueBubble) {
        return 2; // Event Continued
      }
    }
    // walk up
    event3D.currentTarget = event3D.currentTarget.parent;
  }

  return 1; // Event Failed
};

Object.assign(ROS3D.MouseHandler.prototype, THREE.EventDispatcher.prototype);

/**
 * @author David Gossow - dgossow@willowgarage.com
 * @author Xueqiao Xu - xueqiaoxu@gmail.com
 * @author Mr.doob - http://mrdoob.com
 * @author AlteredQualia - http://alteredqualia.com
 */

/**
 * Behaves like THREE.OrbitControls, but uses right-handed coordinates and z as up vector.
 *
 * @constructor
 * @param scene - the global scene to use
 * @param camera - the camera to use
 * @param userZoomSpeed (optional) - the speed for zooming
 * @param userRotateSpeed (optional) - the speed for rotating
 * @param autoRotate (optional) - if the orbit should auto rotate
 * @param autoRotate (optional) - the speed for auto rotating
 */
ROS3D.OrbitControls = function(options) {
  THREE.EventDispatcher.call(this);
  var that = this;
  options = options || {};
  var scene = options.scene;
  this.camera = options.camera;
  this.center = new THREE.Vector3();
  this.userZoom = true;
  this.userZoomSpeed = options.userZoomSpeed || 1.0;
  this.userRotate = true;
  this.userRotateSpeed = options.userRotateSpeed || 1.0;
  this.autoRotate = options.autoRotate;
  this.autoRotateSpeed = options.autoRotateSpeed || 2.0;

  // In ROS, z is pointing upwards
  this.camera.up = new THREE.Vector3(0, 0, 1);

  // internals
  var pixelsPerRound = 1800;
  var touchMoveThreshold = 10;
  var rotateStart = new THREE.Vector2();
  var rotateEnd = new THREE.Vector2();
  var rotateDelta = new THREE.Vector2();
  var zoomStart = new THREE.Vector2();
  var zoomEnd = new THREE.Vector2();
  var zoomDelta = new THREE.Vector2();
  var moveStartCenter = new THREE.Vector3();
  var moveStartNormal = new THREE.Vector3();
  var moveStartPosition = new THREE.Vector3();
  var moveStartIntersection = new THREE.Vector3();
  var touchStartPosition = new Array(2);
  var touchMoveVector = new Array(2);
  this.phiDelta = 0;
  this.thetaDelta = 0;
  this.scale = 1;
  this.lastPosition = new THREE.Vector3();
  this.moveCamera = false;
  // internal states
  var STATE = {
    NONE : -1,
    ROTATE : 0,
    ZOOM : 1,
    MOVE : 2
  };
  var state = STATE.NONE;

  // add the axes for the main coordinate frame
  this.axes = new ROS3D.Axes({
    shaftRadius : 0.025,
    headRadius : 0.07,
    headLength : 0.2
  });
  // initially not visible
  scene.add(this.axes);
  this.axes.traverse(function(obj) {
    obj.visible = false;
  });

  /**
   * Handle the mousedown 3D event.
   *
   * @param event3D - the 3D event to handle
   */
  function onMouseDown(event3D) {
    var event = event3D.domEvent;
    event.preventDefault();
    var button = (event.button === 0 && this.moveCamera) ? 1 : event.button;
    switch (button) {
      case 0:
        state = STATE.ROTATE;
        rotateStart.set(event.clientX, event.clientY);
        break;
      case 1:
        state = STATE.MOVE;

        moveStartNormal = new THREE.Vector3(0, 0, 1);
        var rMat = new THREE.Matrix4().extractRotation(this.camera.matrix);
        moveStartNormal.applyMatrix4(rMat);

        moveStartCenter = that.center.clone();
        moveStartPosition = that.camera.position.clone();
        moveStartIntersection = intersectViewPlane(event3D.mouseRay,
                                                   moveStartCenter,
                                                   moveStartNormal);
        break;
      case 2:
        state = STATE.ZOOM;
        zoomStart.set(event.clientX, event.clientY);
        break;
    }

    this.showAxes();
  }

  /**
   * Handle the mousemove 3D event.
   *
   * @param event3D - the 3D event to handle
   */
  function onMouseMove(event3D) {
    var event = event3D.domEvent;
    if (state === STATE.ROTATE) {

      rotateEnd.set(event.clientX, event.clientY);
      rotateDelta.subVectors(rotateEnd, rotateStart);

      that.rotateLeft(2 * Math.PI * rotateDelta.x / pixelsPerRound * that.userRotateSpeed);
      that.rotateUp(2 * Math.PI * rotateDelta.y / pixelsPerRound * that.userRotateSpeed);

      rotateStart.copy(rotateEnd);
      this.showAxes();
    } else if (state === STATE.ZOOM) {
      zoomEnd.set(event.clientX, event.clientY);
      zoomDelta.subVectors(zoomEnd, zoomStart);

      if (zoomDelta.y > 0) {
        that.zoomIn();
      } else {
        that.zoomOut();
      }

      zoomStart.copy(zoomEnd);
      this.showAxes();

    } else if (state === STATE.MOVE) {
      var intersection = intersectViewPlane(event3D.mouseRay, that.center, moveStartNormal);

      if (!intersection) {
        return;
      }

      var delta = new THREE.Vector3().subVectors(moveStartIntersection.clone(), intersection
          .clone());

      that.center.addVectors(moveStartCenter.clone(), delta.clone());
      that.camera.position.addVectors(moveStartPosition.clone(), delta.clone());
      that.update();
      that.camera.updateMatrixWorld();
      this.showAxes();
    }
  }

  /**
   * Used to track the movement during camera movement.
   *
   * @param mouseRay - the mouse ray to intersect with
   * @param planeOrigin - the origin of the plane
   * @param planeNormal - the normal of the plane
   * @returns the intersection
   */
  function intersectViewPlane(mouseRay, planeOrigin, planeNormal) {

    var vector = new THREE.Vector3();
    var intersection = new THREE.Vector3();

    vector.subVectors(planeOrigin, mouseRay.origin);
    var dot = mouseRay.direction.dot(planeNormal);

    // bail if ray and plane are parallel
    if (Math.abs(dot) < mouseRay.precision) {
      return null;
    }

    // calc distance to plane
    var scalar = planeNormal.dot(vector) / dot;

    intersection = mouseRay.direction.clone().multiplyScalar(scalar);
    return intersection;
  }

  /**
   * Handle the mouseup 3D event.
   *
   * @param event3D - the 3D event to handle
   */
  function onMouseUp(event3D) {
    if (!that.userRotate) {
      return;
    }

    state = STATE.NONE;
  }

  /**
   * Handle the mousewheel 3D event.
   *
   * @param event3D - the 3D event to handle
   */
  function onMouseWheel(event3D) {
    if (!that.userZoom) {
      return;
    }

    var event = event3D.domEvent;
    // wheelDelta --> Chrome, detail --> Firefox
    var delta;
    if (typeof (event.wheelDelta) !== 'undefined') {
      delta = event.wheelDelta;
    } else {
      delta = -event.detail;
    }
    if (delta > 0) {
      that.zoomIn();
    } else {
      that.zoomOut();
    }

    this.showAxes();
  }

  /**
   * Handle the touchdown 3D event.
   *
   * @param event3D - the 3D event to handle
   */
  function onTouchDown(event3D) {
    var event = event3D.domEvent;
    var rMat;
    switch (event.touches.length) {
      case 1:
        if(this.moveCamera) {
          state = STATE.MOVE;
          moveStartNormal = new THREE.Vector3(0, 0, 1);
          rMat = new THREE.Matrix4().extractRotation(this.camera.matrix);
          moveStartNormal.applyMatrix4(rMat);
          moveStartCenter = that.center.clone();
          moveStartPosition = that.camera.position.clone();
          moveStartIntersection = intersectViewPlane(event3D.mouseRay,
                                                     moveStartCenter,
                                                     moveStartNormal);
        } else {
          state = STATE.ROTATE;
          rotateStart.set(event.touches[0].pageX - window.scrollX,
                         event.touches[0].pageY - window.scrollY);  
        }
        
        break;
      case 2:
        state = STATE.NONE;
        /* ready for move */
        moveStartNormal = new THREE.Vector3(0, 0, 1);
        rMat = new THREE.Matrix4().extractRotation(this.camera.matrix);
        moveStartNormal.applyMatrix4(rMat);
        moveStartCenter = that.center.clone();
        moveStartPosition = that.camera.position.clone();
        moveStartIntersection = intersectViewPlane(event3D.mouseRay,
                                                   moveStartCenter,
                                                   moveStartNormal);
        touchStartPosition[0] = new THREE.Vector2(event.touches[0].pageX,
                                                  event.touches[0].pageY);
        touchStartPosition[1] = new THREE.Vector2(event.touches[1].pageX,
                                                  event.touches[1].pageY);
        touchMoveVector[0] = new THREE.Vector2(0, 0);
        touchMoveVector[1] = new THREE.Vector2(0, 0);
        break;
    }

    this.showAxes();

    event.preventDefault();
  }

  /**
   * Handle the touchmove 3D event.
   *
   * @param event3D - the 3D event to handle
   */
  function onTouchMove(event3D) {
    var event = event3D.domEvent;
    if (state === STATE.ROTATE) {

      rotateEnd.set(event.touches[0].pageX - window.scrollX, event.touches[0].pageY - window.scrollY);
      rotateDelta.subVectors(rotateEnd, rotateStart);

      that.rotateLeft(2 * Math.PI * rotateDelta.x / pixelsPerRound * that.userRotateSpeed);
      that.rotateUp(2 * Math.PI * rotateDelta.y / pixelsPerRound * that.userRotateSpeed);

      rotateStart.copy(rotateEnd);
      this.showAxes();
    } else {
      if (state !== STATE.MOVE) {
        touchMoveVector[0].set(touchStartPosition[0].x - event.touches[0].pageX,
                               touchStartPosition[0].y - event.touches[0].pageY);
        touchMoveVector[1].set(touchStartPosition[1].x - event.touches[1].pageX,
                               touchStartPosition[1].y - event.touches[1].pageY);
        if (touchMoveVector[0].lengthSq() > touchMoveThreshold &&
            touchMoveVector[1].lengthSq() > touchMoveThreshold) {
          touchStartPosition[0].set(event.touches[0].pageX,
                                    event.touches[0].pageY);
          touchStartPosition[1].set(event.touches[1].pageX,
                                    event.touches[1].pageY);
          if (touchMoveVector[0].dot(touchMoveVector[1]) > 0 &&
              state !== STATE.ZOOM) {
            state = STATE.MOVE;
          } else if (touchMoveVector[0].dot(touchMoveVector[1]) < 0 &&
                     state !== STATE.MOVE) {
            state = STATE.ZOOM;
          }
          if (state === STATE.ZOOM) {
            var tmpVector = new THREE.Vector2();
            tmpVector.subVectors(touchStartPosition[0],
                                 touchStartPosition[1]);
            if (touchMoveVector[0].dot(tmpVector) < 0 &&
                touchMoveVector[1].dot(tmpVector) > 0) {
              that.zoomOut();
            } else if (touchMoveVector[0].dot(tmpVector) > 0 &&
                       touchMoveVector[1].dot(tmpVector) < 0) {
              that.zoomIn();
            }
          }
        }
      }
      if (state === STATE.MOVE) {
        var intersection = intersectViewPlane(event3D.mouseRay,
                                              that.center,
                                              moveStartNormal);
        if (!intersection) {
          return;
        }
        var delta = new THREE.Vector3().subVectors(moveStartIntersection.clone(),
                                                   intersection.clone());
        that.center.addVectors(moveStartCenter.clone(), delta.clone());
        that.camera.position.addVectors(moveStartPosition.clone(), delta.clone());
        that.update();
        that.camera.updateMatrixWorld();
      }

      this.showAxes();

      event.preventDefault();
    }
  }

  function onTouchEnd(event3D) {
    var event = event3D.domEvent;
    if (event.touches.length === 1 &&
        state !== STATE.ROTATE) {
      state = STATE.ROTATE;
      rotateStart.set(event.touches[0].pageX - window.scrollX,
                      event.touches[0].pageY - window.scrollY);
    }
    else {
        state = STATE.NONE;
    }
  }

  // add event listeners
  this.addEventListener('mousedown', onMouseDown);
  this.addEventListener('mouseup', onMouseUp);
  this.addEventListener('mousemove', onMouseMove);
  this.addEventListener('touchstart', onTouchDown);
  this.addEventListener('touchmove', onTouchMove);
  this.addEventListener('touchend', onTouchEnd);
  // Chrome/Firefox have different events here
  this.addEventListener('mousewheel', onMouseWheel);
  this.addEventListener('DOMMouseScroll', onMouseWheel);
};

/**
 * Display the main axes for 1 second.
 */
ROS3D.OrbitControls.prototype.showAxes = function() {
  var that = this;

  this.axes.traverse(function(obj) {
    obj.visible = true;
  });
  if (this.hideTimeout) {
    clearTimeout(this.hideTimeout);
  }
  this.hideTimeout = setTimeout(function() {
    that.axes.traverse(function(obj) {
      obj.visible = false;
    });
    that.hideTimeout = false;
  }, 1000);
};

/**
 * Rotate the camera to the left by the given angle.
 *
 * @param angle (optional) - the angle to rotate by
 */
ROS3D.OrbitControls.prototype.rotateLeft = function(angle) {
  if (angle === undefined) {
    angle = 2 * Math.PI / 60 / 60 * this.autoRotateSpeed;
  }
  this.thetaDelta -= angle;
};

/**
 * Rotate the camera to the right by the given angle.
 *
 * @param angle (optional) - the angle to rotate by
 */
ROS3D.OrbitControls.prototype.rotateRight = function(angle) {
  if (angle === undefined) {
    angle = 2 * Math.PI / 60 / 60 * this.autoRotateSpeed;
  }
  this.thetaDelta += angle;
};

/**
 * Rotate the camera up by the given angle.
 *
 * @param angle (optional) - the angle to rotate by
 */
ROS3D.OrbitControls.prototype.rotateUp = function(angle) {
  if (angle === undefined) {
    angle = 2 * Math.PI / 60 / 60 * this.autoRotateSpeed;
  }
  this.phiDelta -= angle;
};

/**
 * Rotate the camera down by the given angle.
 *
 * @param angle (optional) - the angle to rotate by
 */
ROS3D.OrbitControls.prototype.rotateDown = function(angle) {
  if (angle === undefined) {
    angle = 2 * Math.PI / 60 / 60 * this.autoRotateSpeed;
  }
  this.phiDelta += angle;
};

/**
 * Zoom in by the given scale.
 *
 * @param zoomScale (optional) - the scale to zoom in by
 */
ROS3D.OrbitControls.prototype.zoomIn = function(zoomScale) {
  if (zoomScale === undefined) {
    zoomScale = Math.pow(0.95, this.userZoomSpeed);
  }
  this.scale /= zoomScale;
};

/**
 * Zoom out by the given scale.
 *
 * @param zoomScale (optional) - the scale to zoom in by
 */
ROS3D.OrbitControls.prototype.zoomOut = function(zoomScale) {
  if (zoomScale === undefined) {
    zoomScale = Math.pow(0.95, this.userZoomSpeed);
  }
  this.scale *= zoomScale;
};

/**
 * Update the camera to the current settings.
 */
ROS3D.OrbitControls.prototype.update = function() {
  // x->y, y->z, z->x
  var position = this.camera.position;
  var offset = position.clone().sub(this.center);

  // angle from z-axis around y-axis
  var theta = Math.atan2(offset.y, offset.x);

  // angle from y-axis
  var phi = Math.atan2(Math.sqrt(offset.y * offset.y + offset.x * offset.x), offset.z);

  if (this.autoRotate) {
    this.rotateLeft(2 * Math.PI / 60 / 60 * this.autoRotateSpeed);
  }

  theta += this.thetaDelta;
  phi += this.phiDelta;

  // restrict phi to be between EPS and PI-EPS
  var eps = 0.000001;
  phi = Math.max(eps, Math.min(Math.PI - eps, phi));

  var radius = offset.length();
  offset.set(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi)
  );
  offset.multiplyScalar(this.scale);

  position.copy(this.center).add(offset);

  this.camera.lookAt(this.center);

  radius = offset.length();
  this.axes.position.copy(this.center);
  this.axes.scale.set(radius * 0.05, radius * 0.05, radius * 0.05);
  this.axes.updateMatrixWorld(true);

  this.thetaDelta = 0;
  this.phiDelta = 0;
  this.scale = 1;

  if (this.lastPosition.distanceTo(this.camera.position) > 0) {
    this.dispatchEvent({
      type : 'change'
    });
    this.lastPosition.copy(this.camera.position);
  }
};

Object.assign(ROS3D.OrbitControls.prototype, THREE.EventDispatcher.prototype);

/**
 * @author Jihoon Lee - jihoonlee.in@gmail.com
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * A SceneNode can be used to keep track of a 3D object with respect to a ROS frame within a scene.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * tfClient - a handle to the TF client
 *  * frameID - the frame ID this object belongs to
 *  * pose (optional) - the pose associated with this object
 *  * object - the THREE 3D object to be rendered
 */
ROS3D.SceneNode = function(options) {
  options = options || {};
  var that = this;
  this.tfClient = options.tfClient;
  this.frameID = options.frameID;
  var object = options.object;
  this.pose = options.pose || new ROSLIB.Pose();
  THREE.Object3D.call(this);

  // Do not render this object until we receive a TF update
  this.visible = false;

  // add the model
  this.add(object);

  // set the inital pose
  this.updatePose(this.pose);

  // save the TF handler so we can remove it later
  this.tfUpdate = function(msg) {

    // apply the transform
    var tf = new ROSLIB.Transform(msg);
    var poseTransformed = new ROSLIB.Pose(that.pose);
    poseTransformed.applyTransform(tf);

    // update the world
    that.updatePose(poseTransformed);
    that.visible = true;
  };

  // listen for TF updates
  this.tfClient.subscribe(this.frameID, this.tfUpdate);
};
ROS3D.SceneNode.prototype.__proto__ = THREE.Object3D.prototype;

/**
 * Set the pose of the associated model.
 *
 * @param pose - the pose to update with
 */
ROS3D.SceneNode.prototype.updatePose = function(pose) {
  this.position.set( pose.position.x, pose.position.y, pose.position.z );
  this.quaternion.set(pose.orientation.x, pose.orientation.y,
      pose.orientation.z, pose.orientation.w);
};

ROS3D.SceneNode.prototype.unsubscribeTf = function() {
  this.tfClient.unsubscribe(this.frameID, this.tfUpdate);
};

/**
 * @author David Gossow - dgossow@willowgarage.com
 * @author Russell Toris - rctoris@wpi.edu
 * @author Jihoon Lee - jihoonlee.in@gmail.com
 */

/**
 * A Viewer can be used to render an interactive 3D scene to a HTML5 canvas.
 *
 * @constructor
 * @param options - object with following keys:
 *
 *  * divID - the ID of the div to place the viewer in
 *  * width - the initial width, in pixels, of the canvas
 *  * height - the initial height, in pixels, of the canvas
 *  * background (optional) - the color to render the background, like '#efefef'
 *  * alpha (optional) - the alpha of the background
 *  * antialias (optional) - if antialiasing should be used
 *  * intensity (optional) - the lighting intensity setting to use
 *  * cameraPosition (optional) - the starting position of the camera
 *  * maxFps (optional) - maximum fps to redraw
 */
ROS3D.Viewer = function(options) {
  options = options || {};
  var divID = options.divID;
  var width = options.width;
  var height = options.height;
  var background = options.background || '#111111';
  var antialias = options.antialias;
  var intensity = options.intensity || 0.66;
  var near = options.near || 0.01;
  var far = options.far || 1000;
  var alpha = options.alpha || 1.0;
  var cameraPosition = options.cameraPose || {
    x : 3,
    y : 3,
    z : 3
  };
  var cameraZoomSpeed = options.cameraZoomSpeed || 0.5;
  this.maxFps = options.maxFps;

  // create the canvas to render to
  this.renderer = new THREE.WebGLRenderer({
    antialias : antialias,
    alpha: true
  });
  this.renderer.setClearColor(parseInt(background.replace('#', '0x'), 16), alpha);
  this.renderer.sortObjects = false;
  this.renderer.setSize(width, height);
  this.renderer.shadowMap.enabled = false;
  this.renderer.autoClear = false;

  // create the global scene
  this.scene = new THREE.Scene();

  // create the global camera
  this.camera = new THREE.PerspectiveCamera(40, width / height, near, far);
  this.camera.position.x = cameraPosition.x;
  this.camera.position.y = cameraPosition.y;
  this.camera.position.z = cameraPosition.z;
  // add controls to the camera
  this.cameraControls = new ROS3D.OrbitControls({
    scene : this.scene,
    camera : this.camera
  });
  this.cameraControls.userZoomSpeed = cameraZoomSpeed;

  // lights
  this.scene.add(new THREE.AmbientLight(0x555555));
  this.directionalLight = new THREE.DirectionalLight(0xffffff, intensity);
  this.scene.add(this.directionalLight);

  // propagates mouse events to three.js objects
  this.selectableObjects = new THREE.Object3D();
  this.scene.add(this.selectableObjects);
  var mouseHandler = new ROS3D.MouseHandler({
    renderer : this.renderer,
    camera : this.camera,
    rootObject : this.selectableObjects,
    fallbackTarget : this.cameraControls
  });

  // highlights the receiver of mouse events
  this.highlighter = new ROS3D.Highlighter({
    mouseHandler : mouseHandler
  });

  this.stopped = true;
  this.animationRequestId = undefined;

  // add the renderer to the page
  document.getElementById(divID).appendChild(this.renderer.domElement);

  // begin the render loop
  this.start();
};

/**
 *  Start the render loop
 */
ROS3D.Viewer.prototype.start = function(){
  this.stopped = false;
  this.draw();
};

/**
 * Renders the associated scene to the viewer.
 */
ROS3D.Viewer.prototype.draw = function(){
  if(this.stopped){
    // Do nothing if stopped
    return;
  }

  // update the controls
  this.cameraControls.update();

  // put light to the top-left of the camera
  var cameraPos = this.camera.localToWorld(new THREE.Vector3(-1, 1, 0)).normalize();
  this.directionalLight.position.set(cameraPos.x, cameraPos.y, cameraPos.z);

  // set the scene
  this.renderer.clear(true, true, true);
  this.renderer.render(this.scene, this.camera);
  this.highlighter.renderHighlights(this.scene, this.renderer, this.camera);

  // draw the frame
  if(this.maxFps) {
    this.animationRequestId = setTimeout(this.draw.bind(this), 1000 / this.maxFps);
  } else {
    this.animationRequestId = requestAnimationFrame(this.draw.bind(this));
  }
};

/**
 *  Stop the render loop
 */
ROS3D.Viewer.prototype.stop = function(){
  if(!this.stopped){
    // Stop animation render loop
    clearTimeout(this.animationRequestId);
    cancelAnimationFrame(this.animationRequestId);
  }
  this.stopped = true;
};

/**
 * Add the given THREE Object3D to the global scene in the viewer.
 *
 * @param object - the THREE Object3D to add
 * @param selectable (optional) - if the object should be added to the selectable list
 */
ROS3D.Viewer.prototype.addObject = function(object, selectable) {
  if (selectable) {
    this.selectableObjects.add(object);
  } else {
    this.scene.add(object);
  }
};

/**
 * Resize 3D viewer
 *
 * @param width - new width value
 * @param height - new height value
 */
ROS3D.Viewer.prototype.resize = function(width, height) {
  this.camera.aspect = width / height;
  this.camera.updateProjectionMatrix();
  this.renderer.setSize(width, height);
};

/**
 * Throttles fps to the given limit
 *
 * @param   fps new maxFps value
 */
ROS3D.Viewer.prototype.setMaxFps = function (fps) {
  this.maxFps = fps;
};

/**
 * Return max fps value
 *
 * @returns   fps value
 */
ROS3D.Viewer.prototype.getMaxFps = function () {
  return this.maxFps;
};

