//__________________________________________Initialize_____________________________________________//
//Map.addLayer(table, {color: 'FF0000'}, 'Imported Shapefile', false);
Map.setCenter(-118.296, 45.084, 6);
// Map.setCenter(-116.79345626808299, 45.855631514122116, 15);
// var aoi = states.filter(ee.Filter.inList('NAME', ['Idaho', 'Oregon','Washington']));
var empty_image = ee.Image().byte();
// Export.table.toAsset({
//   collection: aoi.union(),
//   description:'ssc_aoi',
//   assetId: 'ssc_aoi',
// });
var outline = empty_image.paint({
  featureCollection: aoi,
  color: 1,
  width: 5
});
Map.addLayer(outline, {palette: 'FF0000'}, 'Boundary');
var vis_opt = 'Full';//'Limited'//'Full';
Map.setOptions('satellite');
Map.style().set('cursor', 'crosshair');

// var occurrence = gsw.select('occurrence');
var Chosen_Index = 'aNDWI';
// var Chosen_Geometry;
var Chosen_Geometry;

var Export_Method = 'Google Drive';
var ID = 0;

var harmonizer_obj = require('users/Water_Delineation/SSC_app:Harmonizer')
                      .init();
// var harmonized_dataset = harmonizer_obj.merged_dataset;
var gsw = harmonizer_obj.gsw;
// var gsw = harmonizer_obj.watch;

var harmonizer_obj = require('users/Water_Delineation/SSC_app:Harmonizer')
                                  .init('2019-03-10', '2019-03-20', Chosen_Geometry);
var harmonized_image = harmonizer_obj.merged_dataset;
// var model_obj = require('users/Water_Delineation/SSC_app:ProcessDev')
//                         .init(harmonized_image, vis_opt, Chosen_Geometry);
// var hd = harmonized_dataset;
  
var visualization = {
    bands: ['RED', 'GREEN', 'BLUE'],
    min: 0.0,
    max: 0.3,
  };
// Map.addLayer(hd.mean(), visualization, 'hd');
// Map.addLayer(hd.mean().mask(cmask), visualization, 'hd_m');
// var VIS_OCCURRENCE = {
//   min: 0,
//   max: 100,
//   palette: ['red', 'blue']
// };
// Map.addLayer({
//   eeObject: occurrence.updateMask(occurrence.divide(100)),
//   name: 'Water Occurrence',
//   visParams: VIS_OCCURRENCE
// });

// Create a panel with vertical flow layout.
var panel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: {width: '400px'}
});



var vis_panel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: {width: '500px'}
});

// Create a map panel.
var mapPanel = ui.Map();
// Take all tools off the map except the zoom and mapTypeControl tools.

// //__________________________________________Panel_____________________________________________//

var label_O = ui.Label('Suspended sediment', {fontSize: '50px', fontWeight: 'bold', whiteSpace: 'pre'});
vis_panel.add(label_O);
var label_O = ui.Label('concentration (SSC)', {fontSize: '50px', fontWeight: 'bold', whiteSpace: 'pre'});
vis_panel.add(label_O);
var label_O = ui.Label('monitoring App', {fontSize: '50px', fontWeight: 'bold', whiteSpace: 'pre'});
vis_panel.add(label_O);

var tilte = ui.Label('\n____________________ OPTIONAL ____________________\n', {fontWeight: 'bold', whiteSpace: 'pre'});
vis_panel.add(tilte);
var clable = ui.Label('\nOverlay water map (optional)', {fontWeight: 'bold', whiteSpace: 'pre'}); 
vis_panel.add(clable);
// var gsw_panel = ui.Select([], 'Loading..');
// gsw_panel.items().reset(['Water Occurrence']);
// gsw_panel.setPlaceholder('Water map');
var gsw_panel = ui.Checkbox({label: 'Select to look at water probabilities prior to selection', style: {fontWeight: 'bold'}});
gsw_panel.onChange(function(state){
  Map.addLayer(gsw.select('occurrence'),  {min: 0, max: 100, palette: ['red', 'blue']}, 'water map', true);
});
vis_panel.add(gsw_panel);


var app = {};
app.VIS_OPTIONS = {
    'Water Occurrence': {
      name: 'occurrence',
      description: 'probability 0-100 red to blue',
      visParams: {min: 0, max: 100, palette: ['red', 'blue']},
      legend: [
      {'0% probability': 'red'}, {'...': 'pink'}, {'100% probability': 'blue'}
      ],
      defaultVisibility: true
    }
};
var selectItems = Object.keys(app.VIS_OPTIONS);
var layerSelect = ui.Select({
    items: selectItems,
    value: selectItems[0],
    onChange: function(selected) {
      // Loop through the map layers and compare the selected element to the name
      // of the layer. If they're the same, show the layer and set the
      // corresponding legend.  Hide the others.
      mapPanel.layers().forEach(function(element, index) {
        element.setShown(selected == element.getName());
      });
      setLegend(app.VIS_OPTIONS[selected].legend);
    }
});
function setLegend(legend) {
  // Loop through all the items in a layer's key property,
  // creates the item, and adds it to the key panel.

  for (var i = 0; i < legend.length; i++) {
    var item = legend[i];
    var name = Object.keys(item)[0];
    var color = item[name];
    var colorBox = ui.Label('', {
      backgroundColor: color,
      // Use padding to give the box height and width.
      padding: '18px',
      margin: '13'
    });
    // Create the label with the description text.
    var description = ui.Label(name, {margin: '0 0 4px 6px'});
    vis_panel.add(
        ui.Panel([colorBox, description], ui.Panel.Layout.Flow('horizontal')));
  }
}
setLegend(app.VIS_OPTIONS[layerSelect.getValue()].legend);

var tilte_end = ui.Label('\n____________________________________________________\n', {fontWeight: 'bold', whiteSpace: 'pre'});
vis_panel.add(tilte_end);

var label2_O = ui.Label('\nDraw a ploygon:', {fontWeight: 'bold', whiteSpace: 'pre'});
vis_panel.add(label2_O);
var text = ui.Label(
    'Use the drawing tool (Select “AOI”) to define the region of interest for assessing SSC. Due to computational constraints, focus on a small area..',
    {fontSize: '15px'});
vis_panel.add(text);
var checkbox_GS = ui.Checkbox({label: 'Select "AOI" layer and draw (Step 1)', style: {fontWeight: 'bold'}});
// Define a global variable to store Chosen_Geometry
var globalChosenGeometry = null;

// checkbox_GS.onChange(function(checked) {
//                 var drawing_tools = Map.drawingTools();
//                 // drawing_tools.setShown(false);
//                 // while (drawing_tools.layers().length() > 0) {
//                 //   var layer = drawing_tools.layers().get(0);
//                 //   drawing_tools.layers().remove(layer);
//                 // }
//                 var null_geometry =
//                     ui.Map.GeometryLayer({geometries: null, name: 'geometry', color: 'red'});
                
//                 drawing_tools.layers().add(null_geometry);
//                 drawing_tools.setLinked(false);
//                 drawing_tools.setDrawModes(['polygon']);
//                 drawing_tools.addLayer([], 'AOI', 'red').setShown(checked);
//                 drawing_tools.setShape('polygon');
//                 drawing_tools.draw();
                
//                 // var getPolygon = ui.util.debounce(function() {
//                 //   var Chosen_Geometry = drawing_tools.layers().get(0).toGeometry();
                  
//                 //   var local_aoi = drawing_tools.layers().get(0).getEeObject();
//                 //   // print(local_aoi);
//                 //   var local_aoi_fc = ee.FeatureCollection(local_aoi);
//                 //   var empty = ee.Image().byte();
//                 //   var outline = empty.paint({
//                 //     featureCollection: local_aoi_fc,
//                 //     color: 1,
//                 //     width: 3
//                 //   });
//                 //   Map.addLayer(outline, {palette: 'red'}, 'AOI');
//                 //   var local_layers = drawing_tools.layers();
//                 //   local_layers.get(0).geometries().remove(local_layers.get(0).geometries().get(0));
                  
//                 // }, 100);
//                 // print('Chosen_Geometry checkbox_GS', Chosen_Geometry)
//                 function calculateGeometryAndCallback(callback) {
//                   var Chosen_Geometry = drawing_tools.layers().get(0).toGeometry();
                  
//                   var local_aoi = drawing_tools.layers().get(0).getEeObject();
//                   var local_aoi_fc = ee.FeatureCollection(local_aoi);
//                   var empty = ee.Image().byte();
//                   var outline = empty.paint({
//                     featureCollection: local_aoi_fc,
//                     color: 1,
//                     width: 3
//                   });
//                   Map.addLayer(outline, {palette: 'red'}, 'AOI');
                  
//                   var local_layers = drawing_tools.layers();
//                   local_layers.get(0).geometries().remove(local_layers.get(0).geometries().get(0));
                  
//                   // Store Chosen_Geometry in the global variable
//                   globalChosenGeometry = Chosen_Geometry;
//                   // globalChosenGeometry.setValue(Chosen_Geometry);
//                   // Invoke the callback with the calculated Chosen_Geometry
//                   //callback(Chosen_Geometry);
//                 }
                
//                 // Create a debounced function that calls the function with the callback
//                 var getPolygon = ui.util.debounce(function(callback) {
//                   calculateGeometryAndCallback(callback);
//                 }, 100);
                
//                 // Define a function to handle Chosen_Geometry after it's calculated
//                 function handleChosenGeometry(chosenGeometry) {
//                   print('Chosen_Geometry checkbox_GS', chosenGeometry);
//                   // Use chosenGeometry or globalChosenGeometry wherever needed
//                   // For example:
//                   // Do something with chosenGeometry or globalChosenGeometry
//                 }
                                
//                 getPolygon(handleChosenGeometry);
                
//                 // ............................
                
//                 drawing_tools.onDraw(getPolygon);
                
//                 var undraw = ui.util.debounce(function() {
//                   drawing_tools.setShape(null);
//                 }, 200);
                
//                 drawing_tools.onDraw(undraw);
//                 print('Chosen_Geometry', globalChosenGeometry);
                
                
// });
// vis_panel.add(checkbox_GS);
checkbox_GS.onChange(function(checked) {
  function removeAllLayers() {
    var layers = Map.layers();
    
    layers.forEach(function(layer) {
      Map.layers().remove(layer);
    });
  }
  
  // Call the function to remove all layers
  removeAllLayers();
  var drawing_tools = Map.drawingTools();
  var null_geometry = ui.Map.GeometryLayer({ geometries: null, name: 'geometry', color: 'red' });

  drawing_tools.layers().add(null_geometry);
  drawing_tools.setLinked(false);
  drawing_tools.setDrawModes(['polygon']);
  drawing_tools.addLayer([], 'AOI', 'red').setShown(false);
  drawing_tools.setShape('polygon');
  drawing_tools.draw();

  function calculateGeometryAndCallback() {
    var Chosen_Geometry = drawing_tools.layers().get(0).toGeometry();
    var local_aoi = drawing_tools.layers().get(0).getEeObject();
    var local_aoi_fc = ee.FeatureCollection(local_aoi);
    var empty = ee.Image().byte();
    var outline = empty.paint({
      featureCollection: local_aoi_fc,
      color: 1,
      width: 3
    });
    Map.addLayer(outline, { palette: 'red' }, 'AOI');

    // Update globalChosenGeometry directly
    globalChosenGeometry = Chosen_Geometry;
  }
  var local_layers = drawing_tools.layers();
  local_layers.get(0).geometries().remove(local_layers.get(0).geometries().get(0));
  drawing_tools.onDraw(ui.util.debounce(calculateGeometryAndCallback, 100));

  var undraw = ui.util.debounce(function() {
    drawing_tools.setShape(null);
  }, 200);

  drawing_tools.onDraw(undraw);
  // Hide the drawn geometry from the map display
  
});

vis_panel.add(checkbox_GS);


var clable = ui.Label('\nType in start date (Step 2)', {fontWeight: 'bold', whiteSpace: 'pre'}); 
vis_panel.add(clable);
var text = ui.Label(
    'This collects all Harmonized Landsat and Sentinel images for the selected period, and takes the mean reflectance for each pixel across all images.',
    {fontSize: '15px'});
vis_panel.add(text);
var start_date = ui.Textbox({placeholder:'YYYY-MM-DD', value:'2017-05-01',
                              onChange: function(value) {
                                        start_date.setValue(value);
                                        return(value)}});
vis_panel.add(start_date);
var clable2 = ui.Label('Type in end date (Step 3)', {fontWeight: 'bold', whiteSpace: 'pre'}); 
vis_panel.add(clable2);
var end_date = ui.Textbox({placeholder:'YYYY-MM-DD', value:'2017-06-01',
                              onChange: function(value) {
                                        end_date.setValue(value);
                                        return(value)}});
vis_panel.add(end_date);
// print(start_date.get('value'));
// applyButton: ui.Button('Apply filters', app.applyFilters),
var text3 = ui.Label(
    'Downloading the image will open a new tab and can take a while to complete.',
    {fontSize: '15px'});
vis_panel.add(text3);    


function updateSSC() {
  // Map.centerObject(Chosen_Geometry, 13);
  var harmonizer_obj = require('users/Water_Delineation/SSC_app:Harmonizer')
    .init(start_date.get('value'), end_date.get('value'), globalChosenGeometry);
  
  var harmonized_image = ee.ImageCollection(harmonizer_obj.merged_dataset).mean();
  var collectionSize = harmonized_image.bandNames().size();
  var errorOccurred = false;
  // if (collectionSize.getInfo() === 0) {
  //   errorOccurred = true;
  // }
  
// if(errorOccurred) {
//     // var inspector_panel = ui.Panel([ui.Label('No images in selected period, restart the app')]);
//     // inspector_panel.style().set({position: 'middle-right', fontSize: '200px', color: '#FF0000',
//     //                               fontWeight: 'bold'});
//     // Map.add(inspector_panel);
    
//     // var texterror = ui.Label(
//     //   'No images in selected period, restart the app',
//     //   { fontSize: '15px' }
//     // );
//     // vis_panel.add(texterror);
//   } else {
//     if(layer_opt) {                   
//       Map.addLayer(harmonized_image, visualization, 'Harmonized_Image');
//     }
//   }
  var model_obj= require('users/Water_Delineation/SSC_app:ProcessDev')
                    .init(harmonized_image, vis_opt, Chosen_Geometry);
  
                                
  return {harmonized_image: harmonized_image, model_obj: model_obj, errorOccurred: errorOccurred};                           
                          
}

var Button_GV_O = ui.Button({label: 'Run SSC (Step 4)', 
                              onClick: function() {
                              
                              var obj = updateSSC();
                              var model_obj = obj.model_obj;
                              var errorOccurred = obj.errorOccurred;
                              var harmonized_image = obj.harmonized_image;
                              var regression = model_obj.regression;
                              // print('iamge info',regression.getInfo())
                              // var error = regression.error();
                              // Try adding the layer, catch any potential errors
                              if (errorOccurred) {
                                var inspector_panel = ui.Panel([ui.Label('No images in selected period, restart the app')]);
                                inspector_panel.style().set({position: 'middle-right', fontSize: '200px', color: '#FF0000',
                                                              fontWeight: 'bold'});
                                Map.add(inspector_panel);
                              } else {
                                // Add the layer to the map
                                var viz = {palette: model_obj.palette, min: model_obj.min_vis, max: model_obj.max_vis};
                                Map.addLayer(harmonized_image, visualization, 'Harmonized_Image');
                                Map.addLayer(regression, viz, 'SSC');
                              }
                              
                              
                             
                              var drawingTools = Map.drawingTools();
                                while (drawingTools.layers().length() > 0) {
                                  var layer = drawingTools.layers().get(0);
                                  drawingTools.layers().remove(layer);
                                }
                                var ssc_image = ee.Image(model_obj.regression).select('predicted');
                                var palette = model_obj.palette;
                                // var min_vis = 0;//model_obj.min_vis;
                                // var max_vis = 300;//model_obj.max_vis;
                                // print(palette, 'palette');
                                // print(min_vis, 'min_vis');
                                // print(max_vis, 'max_vis');
                                // Legend
                                // set position of panel
                                var legend = ui.Panel({
                                  style: {
                                    position: 'bottom-left',
                                    padding: '8px 15px'
                                  }
                                });
                                 
                                // Create legend title
                                var legendTitle = ui.Label({
                                  value: 'SSC (mg/l)',
                                  style: {
                                    fontWeight: 'bold',
                                    fontSize: '18px',
                                    margin: '0 0 4px 0',
                                    padding: '0'
                                    }
                                });
                                 
                                // Add the title to the panel
                                legend.add(legendTitle);
                                 
                                // Creates and styles 1 row of the legend.
                                var makeRow = function(color, name) {
                                 
                                      // Create the label that is actually the colored box.
                                      var colorBox = ui.Label({
                                        style: {
                                          backgroundColor: '#' + color,
                                          // Use padding to give the box height and width.
                                          padding: '8px',
                                          margin: '0 0 4px 0'
                                        }
                                      });
                                 
                                      // Create the label filled with the description text.
                                      var description = ui.Label({
                                        value: name,
                                        style: {margin: '0 0 4px 6px'}
                                      });
                                 
                                      // return the panel
                                      return ui.Panel({
                                        widgets: [colorBox, description],
                                        layout: ui.Panel.Layout.Flow('horizontal')
                                      });
                                };
                                 
                                //  Palette with the colors
                                // var palette =['FF0000', '22ff00', '1500ff'];
                                 
                                // name of the legend
                                // var steps = ee.Number(max_vis).subtract(ee.Number(min_vis));
                                // steps = steps.divide(ee.List(palette).size()).int();
                                var steps = 15;
                                // print('steps', steps);
                                // Add color and and names
                                // var count = 0;
                                // var min_vis_server = min_vis;
                                // var max_vis_server = max_vis.getInfo();
                                // var steps_server = steps.getInfo();
                                for (var i = 0; i < 24; i++) {   
                                  var val = i*steps; 
                                  // print('val', val);
                                  // print('plat', palette[i]);
                                  legend.add(makeRow(palette[i], val));
                                  // count = count+2
                                }  
                                legend.add(makeRow(palette[24], '> 360'));
                                 
                                // add legend to map (alternatively you can also print the legend to the console)
                                Map.add(legend);
                                // extract point values
                                var inspector_panel = ui.Panel([ui.Label('Click to get SSC')]);
                                inspector_panel.style().set({position: 'bottom-center'});
                                Map.add(inspector_panel);
                                Map.onClick(function(coords) {
                                  // Show the loading label.
                                  inspector_panel.widgets().set(0, ui.Label({
                                    value: 'Processing...',
                                    style: {color: 'gray'}
                                  }));
                                  
                                  // add point to the map
                                  var point = ee.Geometry.Point(coords.lon, coords.lat);
                                  var dot = ui.Map.Layer(point, {color: 'FF0000'});
                                  Map.layers().set(5, dot);
                                        
                                  
                                  var click_point = ee.Geometry.Point(coords.lon, coords.lat);
                                  var demValue = ssc_image.reduceRegion(ee.Reducer.first(), click_point, 30).evaluate(function(val){
                                    var demText = (val.predicted !== null) ? 'SSC at POI (mg/l): ' + ee.Number(val.predicted).int().getInfo() : null;
                                    inspector_panel.widgets().set(2, ui.Label({value: demText}));
                                    // Remove the 'Processing...' label after displaying demText
                                    inspector_panel.widgets().set(0, ui.Label({value: null}));
                                  });
                               
                                  inspector_panel.widgets().set(1, ui.Label({value: 'Long: ' 
                                       + coords.lon 
                                       + '  '
                                       + ' Lat: '+ coords.lat}));
                                });
                              
                                // Define a function to generate a download URL of the image for the
                                // viewport region. 
                                function downloadImg() {
                                  var viewBounds = Chosen_Geometry;
                                  var downloadArgs = {
                                    name: 'ee_image',
                                    crs: ssc_image.projection().crs(),
                                    scale: 30,
                                    region: viewBounds.toGeoJSONString()
                                 };
                                 var url = ssc_image.getDownloadURL(downloadArgs);
                                 urlLabel.setUrl(url);
                                 urlLabel.style().set({shown: true});
                                }
                                
                                // Add UI elements to the Map.
                                var downloadButton = ui.Button('Download SSC Raster', downloadImg);
                                var urlLabel = ui.Label('Download', {shown: false});
                                // vis_panel.add(downloadButton);
                                // vis_panel.add(urlLabel);
                                var panel = ui.Panel([downloadButton, urlLabel]);
                                Map.add(panel);
                                // style: {stretch: 'horizontal',
                                //       fontSize: '20px',
                                //       fontWeight: 'bold',
                                // }
                              }
                                
});
vis_panel.add(Button_GV_O);
start_date.onChange(updateSSC());
end_date.onChange(updateSSC);
checkbox_GS.onChange(updateSSC);
// function updateGlobalChosenGeometry(newGeometry) {
//   globalChosenGeometry = newGeometry;
//   updateSSC(); // Call updateSSC when the globalChosenGeometry changes
// }

var text1 = ui.Label(
    '\nTo check another location or different time click the reset button and start over.\n',
    {fontSize: '15px'});
vis_panel.add(text1);




var text1 = ui.Label(
    '\nIf the selected time period does not include an image, you will notice a red bar within the layers section (top right on the map), signifying an unsuccessful attempt.\n',
    {fontSize: '15px'});
vis_panel.add(text1);
var text2 = ui.Label(
    '\nPlease disregard the "Geometry Imports" panel as it is managed automatically by the application.\n',
    {fontSize: '15px'});
vis_panel.add(text2);

var Button_r = ui.Button({
  label: 'Reset APP (Step 5)',
  onClick: function() {
    // Clearing UI elements but not resetting globalChosenGeometry
    Map.clear();
    ui.root.clear();
    ui.root.add(oldMap);
    ui.root.add(oldApp);
    function removeAllLayers() {
      var layers = Map.layers();
      var count = layers.length();
      
      for (var i = 0; i < count; i++) {
        Map.layers().get(0).remove(); // Remove the first layer in each iteration
      }
    }
    
    // Call the function to remove all layers
    removeAllLayers();
    Map.addLayer(outline, { palette: 'FF0000' }, 'Boundary');
    var storedCenter = Map.getCenter();
    var storedZoom = Map.getZoom();
    Map.setCenter(
      storedCenter.coordinates().get(0).getInfo(),
      storedCenter.coordinates().get(1).getInfo(),
      storedZoom
    );
  },
  style: {
    stretch: 'horizontal',
    color: '#FF0000',
    fontSize: '20px',
    fontWeight: 'bold'
  }
});

// var Button_r = ui.Button({label: 'Reset APP (Step 5)', 
//                               onClick: function() {
//                                 Map.clear();
//                                 ui.root.clear();
//                                 ui.root.add(oldMap);
//                                 ui.root.add(oldApp);
//                                 Map.addLayer(outline, {palette: 'FF0000'}, 'Boundary');
//                                 var storedCenter = Map.getCenter();
//                                 var storedZoom = Map.getZoom();
//                                 Map.setCenter(storedCenter.coordinates().get(0).getInfo(), storedCenter.coordinates().get(1).getInfo(), storedZoom);
//                               },
//                               style: {stretch: 'horizontal',
//                                       color: '#FF0000',
//                                       fontSize: '20px',
//                                       fontWeight: 'bold'
//                               }
// });


vis_panel.add(Button_r);

ui.root.add(vis_panel);
var oldMap = ui.root.widgets().get(0);
var oldApp = ui.root.widgets().get(1);
