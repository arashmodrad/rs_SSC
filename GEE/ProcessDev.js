exports.init = function(image_input, vis_opt, aoi) {

    ssc_data = ee.FeatureCollection(ssc_data, 'geometry');
    
    function normalizeData(feature) {
      var b = ee.Number(feature.get('BLUE'));
      var g = ee.Number(feature.get('GREEN'));
      var r = ee.Number(feature.get('RED'));
      var n = ee.Number(feature.get('NIR'));
      var s1 = ee.Number(feature.get('SWIR1'));
      var s2 = ee.Number(feature.get('SWIR2'));
      var bg = ee.Number(feature.get('BG'));
      var br = ee.Number(feature.get('BR'));
      var bn = ee.Number(feature.get('BN'));
      var bs1 = ee.Number(feature.get('BS1'));
      var bs2 = ee.Number(feature.get('BS2'));
      var gr = ee.Number(feature.get('GR'));
      var gn = ee.Number(feature.get('GN'));
      var gs1 = ee.Number(feature.get('GS1'));
      var gs2 = ee.Number(feature.get('GS2'));
      var rn = ee.Number(feature.get('RN'));
      var rs1 = ee.Number(feature.get('RS1'));
      var rs2 = ee.Number(feature.get('RS2'));
      var ns1 = ee.Number(feature.get('NS1'));
      var ns2 = ee.Number(feature.get('NS2'));
      var s1s2 = ee.Number(feature.get('S1S2'));
      var ANDWI = ee.Number(feature.get('ANDWI'));
      var MNDWI = ee.Number(feature.get('MNDWI'));
      var NDSSI = ee.Number(feature.get('NDSSI'));
      var NDWI = ee.Number(feature.get('NDWI'));
      var ssc =  ee.Number(feature.get('p80154'));
  
      return feature.set({'BLUE': b.abs().log(),
                          'GREEN': g.abs().log(),
                          'RED': r.abs().log(),
                          'NIR': n.abs().log(),
                          'SWIR1': s1.abs().log(),
                          'SWIR2': s2.abs().log(),
                          'BG': bg.abs().log(),
                          'BR': br.abs().log(),
                          'BN': bn.abs().log(),
                          'BS1': bs1.abs().log(),
                          'BS2': bs2.abs().log(),
                          'GR': gr.abs().log(),
                          'GN': gn.abs().log(),
                          'GS1': gs1.abs().log(),
                          'GS2': gs2.abs().log(),
                          'RN': rn.abs().log(),
                          'RS1': rs1.abs().log(),
                          'RS2': rs2.abs().log(),
                          'NS1': ns1.abs().log(),
                          'NS2': ns2.abs().log(),
                          'ANDWI': ANDWI,
                          'MNDWI': MNDWI,
                          'NDSSI': NDSSI,
                          'NDWI': NDWI,
                          'p80154': ((ssc.pow(0.3)).subtract(1)).divide(0.3)
      });
    }
    
  
    // generate a new property for all features
    ssc_data = ssc_data.map(normalizeData);
    
    function calABS(feature)
    {
      var ssc_value = ee.Number(feature.get('p80154')).abs();
      return feature.set('p80154', ssc_value);
    }
  
    var trainingData = ssc_data.map(calABS);
  
    
    var bands = trainingData.first().toDictionary().keys();
  
    var extra = ee.List(['BLUE_stdDev','TimeDiff', 'datetime', 'isNull', 'site_no', 'system',
                          'GREEN_stdDev', 'NIR_stdDev', 'RED_stdDev','SWIR1_stdDev', 'SWIR2_stdDev',
                          'LongitudeMeasure_LatitudeMeasure', 'random', 'p80154']);                      
    bands = bands.removeAll(extra);
    
    var regressor = ee.Classifier.smileRandomForest({numberOfTrees: 8000,
                                                      variablesPerSplit: null,
                                                      minLeafPopulation: 1,
                                                      bagFraction: 0.8,
                                                      maxNodes: null,
                                                      seed: 0})
      .setOutputMode('REGRESSION')
      .train({
              features: trainingData,
              classProperty: 'p80154',
              inputProperties: bands
      });
    
    var regression = image_input.select(bands).classify(regressor, 'predicted');
    regression = ((regression.multiply(0.3)).add(1)).pow(ee.Number(1).divide(0.3));
    
    
    var palettes = require('users/gena/packages:palettes');
    var palette = palettes.crameri.nuuk[25];
    var crs = image_input.projection();
  
    
    switch(vis_opt) {
        case 'Limited':
          var regressionMin = (regression.reduceRegion({
            reducer: ee.Reducer.min(),
            scale: 30, 
            crs: crs,
            bestEffort: true,
            geometry: aoi,
            maxPixels:1e13,
            tileScale: 16
          }));
          var regressionMax = (regression.reduceRegion({
            reducer: ee.Reducer.max(),
            scale: 30, 
            crs: crs,
            bestEffort: true,
            geometry: aoi,
            maxPixels:1e13,
            tileScale: 16
          }));
          var viz = {palette: palette, min: regressionMin.getNumber('predicted').getInfo(), max: regressionMax.getNumber('predicted').getInfo()};
          min_vis = regressionMin.getNumber('predicted').getInfo();
          max_vis = regressionMax.getNumber('predicted').getInfo();
        break;
        default:
          var min_vis = 0;
          var max_vis = 360;
          var viz = {palette: palette, min: min_vis, max: max_vis};
        break;
    }
     
    
    Map.addLayer(regression, viz, 'SSC');
    
  
    return {
        regression: regression,
        vis: palette,
        min_vis: min_vis,
        max_vis: max_vis
    };
  };