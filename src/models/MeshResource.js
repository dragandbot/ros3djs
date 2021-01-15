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
