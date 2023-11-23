exports.init = function(st_time, en_time, geo) {

    state = state.filter(ee.Filter.inList("NAME",ee.List(["Oregon","Idaho","Washington"])));
    if (st_time === undefined || en_time === null){st_time = '2019-03-10'; en_time = '2019-04-10'}
    if (geo === undefined){geo = state}
    var gsw = ee.Image('JRC/GSW1_0/GlobalSurfaceWater').clip(state);
    var cmask = ee.Image(1).mask(gsw.select('occurrence').gt(0));
    // print('st_time', st_time);
    // print('en_time', en_time);
    // print('geo', geo);
    function waterMask(img){
      return img.updateMask(cmask);
    }
    
    function geoCliper(img){
      return img.clip(geo);
    }
    
    function maskS2clouds(image) {
      
      var qa = image.select('QA60');
      // Bits 10 and 11 are clouds and cirrus, respectively.
      var cloudBitMask = 1 << 10;
      var cirrusBitMask = 1 << 11;
      // Both flags should be set to zero, indicating clear conditions.
      var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
          .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
    
      return image.updateMask(mask).divide(10000).copyProperties(image, ['system:time_start','MEAN_SOLAR_AZIMUTH_ANGLE']);
    }
    
    var s2_cloudless_col = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY')
            .filterBounds(geo)
            .filterDate(st_time, en_time);
            
    var Percent_Cloud = 40;
  
    var sentinel_h = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') 
                      .filterDate(st_time, en_time)
                      // Pre-filter to get less cloudy granules.
                      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',Percent_Cloud))
                      .map(maskS2clouds)
                      .filterBounds(geo);  // Intersecting ROI
                      
    // Join the filtered s2cloudless collection to the SR collection by the 'system:index' property.
    var S2 = ee.ImageCollection(ee.Join.saveFirst('s2cloudless').apply({
            primary: sentinel_h,
            secondary: s2_cloudless_col,
            condition: ee.Filter.equals({
                leftField: 'system:index',
                rightField: 'system:index'
            })
    }));
    
    var CLOUD_FILTER = 60;
    var CLD_PRB_THRESH = 50;
    var NIR_DRK_THRESH = 0.15;
    var CLD_PRJ_DIST = 1;
    var BUFFER = 50;
    function add_cloud_bands(img)
    {
      // Get s2cloudless image, subset the probability band.
      var cld_prb = ee.Image(img.get('s2cloudless')).select('probability');
      // Condition s2cloudless by the probability threshold value.
      var is_cloud = cld_prb.gt(CLD_PRB_THRESH).rename('clouds');
      // Add the cloud probability layer and cloud mask as image bands.
      return img.addBands(ee.Image([cld_prb, is_cloud]));
    }
  
    function add_shadow_bands(img)
    {
      // Identify water pixels from the SCL band.
      var not_water = img.select('SCL').neq(6);
    
      // Identify dark NIR pixels that are not water (potential cloud shadow pixels).
      var SR_BAND_SCALE = 1e4;
      var dark_pixels = img.select('B8').lt(NIR_DRK_THRESH*SR_BAND_SCALE).multiply(not_water).rename('dark_pixels');
    
      // Determine the direction to project cloud shadow from clouds (assumes UTM projection).
      var shadow_azimuth = ee.Number(90).subtract(ee.Number(img.get('MEAN_SOLAR_AZIMUTH_ANGLE')));
    
      // Project shadows from clouds for the distance specified by the CLD_PRJ_DIST input.
      var cld_proj = (img.select('clouds').directionalDistanceTransform(shadow_azimuth, CLD_PRJ_DIST*10)
          .reproject({crs: img.select(0).projection(), scale: 100})
          .select('distance')
          .mask()
          .rename('cloud_transform'));
    
      // Identify the intersection of dark pixels with cloud shadow projection.
      var shadows = cld_proj.multiply(dark_pixels).rename('shadows');
    
      // Add dark pixels, cloud projection, and identified shadows as image bands.
      return img.addBands(ee.Image([dark_pixels, cld_proj, shadows]));
    }    
  
    function add_cld_shdw_mask(img)
    {
      // Add cloud component bands.
      var img_cloud = add_cloud_bands(img);
    
      // Add cloud shadow component bands.
      var img_cloud_shadow = add_shadow_bands(img_cloud);
    
      // Combine cloud and shadow mask, set cloud and shadow as value 1, else 0.
      var is_cld_shdw = img_cloud_shadow.select('clouds').add(img_cloud_shadow.select('shadows')).gt(0);
    
      // Remove small cloud-shadow patches and dilate remaining pixels by BUFFER input.
      // 20 m scale is for speed, and assumes clouds don't require 10 m precision.
      is_cld_shdw = (is_cld_shdw.focalMin(2).focalMax(BUFFER*2/20)
          .reproject({crs: img.select([0]).projection(), scale: 20})
          .rename('cloudmask'));
    
      // Add the final cloud-shadow mask to the image.
      return img_cloud_shadow.addBands(is_cld_shdw);
    }
    
    function apply_cld_shdw_mask(img)
    {
      // Subset the cloudmask band and invert it so clouds/shadow are 0, else 1.
      var not_cld_shdw = ee.Image(img).select('cloudmask').not();
    
      // Subset reflectance bands and update their masks, return the result.
      return img.select('B.*').updateMask(not_cld_shdw);
    }  
    
    // final sentinel2 prodoct
    S2 = S2.map(add_cld_shdw_mask).map(apply_cld_shdw_mask);    
    
    var visualization = {
      min: 0.0,
      max: 0.3,
      bands: ['B4', 'B3', 'B2'],
    };
  
    
    
    // ************* Landsats *************
    // algorithms and scaling functions for the collection -------- <<
    // Applies scaling factors.
    function applyScaleFactors(image) {
      var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
      return image.addBands(opticalBands, null, true);
                  // .addBands(thermalBands, null, true);
    }
    
    var band_trans = ee.List(['BLUE','GREEN','RED','NIR','SWIR1','SWIR2']);
    // Chastain R, Housman I, Goldstein J, Finco M, Tenneson K. Empirical cross sensor comparison of Sentinel-2A and 2B MSI, Landsat-8 OLI, and Landsat-7 ETM+ top of atmosphere spectral characteristics over the conterminous United States. Remote sensing of environment. 2019 Feb 1;221:274-85.
    // https://www.sciencedirect.com/science/article/pii/S0034425718305212?via%3Dihub
    var interceptsL8 = [-0.0107,0.0026,-0.0015,0.0033,0.0065,0.0046];
    var slopesL8 = [1.0946,1.0043,1.0524,0.8954,1.0049,1.0002];
    
    function Harmonize98(image)
    {
      image = image.select(band_trans);
      return ee.Image(image.multiply(slopesL8).add(interceptsL8).float().copyProperties(image)).set('system:time_start',image.get('system:time_start'));
    }
    
    var interceptsL7 = [-0.0139,0.0041,-0.0024,-0.0076,0.0041,0.0086];
    var slopesL7 = [1.1060,0.9909,1.0568,1.0045,1.0361,1.0401];
    
    function Harmonize7(image)
    {
      image = image.select(band_trans);
      return ee.Image(image.multiply(slopesL7).add(interceptsL7).float().copyProperties(image)).set('system:time_start',image.get('system:time_start'));
    }
    // Mandanici E, Bitelli G. Preliminary comparison of sentinel-2 and landsat 8 imagery for a combined use. Remote Sensing. 2016 Dec 11;8(12):1014.
    // https://com-mendeley-prod-publicsharing-pdfstore.s3.eu-west-1.amazonaws.com/02fd-CC-BY-2/10.3390/rs8121014.pdf?X-Amz-Security-Token=IQoJb3JpZ2luX2VjEBcaCWV1LXdlc3QtMSJHMEUCIGEXfcTwkSekFL63LOhSa3jeQ9Z7CISIe1P%2Fn12Ztf0yAiEAzSVjMSxCfo7xcwt3x2rLjPsdCze11KY3yWBoqeaXADoqgwQIIBAEGgwxMDgxNjYxOTQ1MDUiDC%2FUERmVRV0JiANOiyrgA9rfKRvNWs68w9JShBCoT%2Fw0XO7miRuIdhV7r%2BrbpnELiNqn%2BPE0RUznSva4UYXXZkDD1aud4Nxx2dWMSJVnbTCLSVmeTIjNNoZp4PmBl%2F0DTUB9rWMeBV2kVaac56FzmcB5VZr8nPvCjUJAMcsO2pw4GpFx62uKvslnbOI16%2B0ja9ER8WylJ491RsBi252VNUP7O%2FEYC%2BO6IisziY%2F4uufdrdXyOzglf3mfFrX1XgHTNP6tjYC0tWCsoX5zeT3pdzJ%2Fs%2BLOMn8SA3llcV6BXd1A3YsGwn8m%2Bjgl6ojVUC5FcWbLtTbNwajSxxmeiZsFFDlpjHoK0xHSX53k7QCHmzFTPzAimHJLmAZwsYt%2FCeHyoCfsQNcGColkxflwsLVbdMJMciuSrZ3eaD%2BivYcT4agzugYJzx35dNmGHtm5bYoGRztyTR8wYtPmDhIgCnKeAm9HLJ748%2BJks9KHuFvLmNUdvHtEWilIwR%2FDn1pmHqNi6LLZvj%2FeOygdaeNdbhwgqHv%2BFCiJlTv5HqAg8RIsRXotx%2FSeYt%2BEJbq4tzDc9FwH52Vfuku0mpn0ODz4G5YCIIj8wHCzlLMo2uksJZ2HQv4wfF5nF5DdOK%2F660x5uIf%2FiTmwaz0%2BtqkRnJ61kbyS9jCO0tWbBjqlASOY7lZxsK6ctJVxQSUa1GAXZi9wwsDk%2BWNm6VcwGacxkIP%2BtGx2yDQACAmeiS4weQvAHQLVqI2DADIcHxlfZQQ8C9k0CVr4WIRO2hmCJ2VrZewVBzTRB%2BEoqswKSQd3IaVqImfSsulL%2FS%2Bb%2B4RT6qoZOlvVXnOaRV%2FsKlazrA%2F1PrdZwpY45vubFj8E4o%2F3KeQ3cu%2BjY5jE6xAQHtccP8tp%2F6TodA%3D%3D&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20221116T230054Z&X-Amz-SignedHeaders=host&X-Amz-Expires=300&X-Amz-Credential=ASIARSLZVEVES7S7HGMN%2F20221116%2Feu-west-1%2Fs3%2Faws4_request&X-Amz-Signature=5aafd8a84e248760e4a62b15e86424d4f25d01b262f7d2ee6766a762d0d2a684
    var interceptsL54 = [-0.0139,0.0041,-0.0024,-0.0076,0.0041,0.0086];
    var slopesL54 = [1.1060,0.9909,1.0568,1.0045,1.0361,1.0401];
    
    function Harmonize54(image)
    {
      image = image.select(band_trans);
      return ee.Image(image.multiply(slopesL54).add(interceptsL54).float().copyProperties(image)).set('system:time_start',image.get('system:time_start'));
    }
    
    // Landsat 8 cloud and shadow mask 
    function maskL8sr(image) 
    {
      // Bits 3 and 5 are cloud shadow and cloud, respectively.
      var cloudShadowBitMask = (1 << 3);
      var cloudsBitMask = (1 << 5);
      // Get the pixel QA band.
      var qa = image.select('QA_PIXEL');
      // Both flags should be set to zero, indicating clear conditions.
      var mask = qa.bitwiseAnd(cloudShadowBitMask).eq(0)
                     .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
      return image.updateMask(mask);
    }
    
    // Landsat 4,5,7 cloud and shadow mask
    var cloudMaskL457 = function(image) {
      var qa = image.select('QA_PIXEL');
      // If the cloud bit (5) is set and the cloud confidence (7) is high
      // or the cloud shadow bit is set (3), then it's a bad pixel.
      var cloud = qa.bitwiseAnd(1 << 5)
                      .and(qa.bitwiseAnd(1 << 7))
                      .or(qa.bitwiseAnd(1 << 3));
      // Remove edge pixels that don't occur in all bands
      var mask2 = image.mask().reduce(ee.Reducer.min());
      return image.updateMask(cloud.not()).updateMask(mask2);
    };
    
    // ------ >> imagery
    var sensor_band_dict = ee.Dictionary({
                              l9 : ee.List([1,2,3,4,5,6]),
                              l8 : ee.List([1,2,3,4,5,6]),
                              l7 : ee.List([0,1,2,3,4,5]),
                              l5 : ee.List([0,1,2,3,4,5]),
                              l4 : ee.List([0,1,2,3,4,5]),
                              s2 : ee.List([1,2,3,7,10,11])
                              });
      
    // Sensor band names corresponding to selected band numbers                        
    var bandNames = ee.List(['BLUE','GREEN','RED','NIR','SWIR1','SWIR2']);
    // ------------------------------------------------------
    // Landsat 4 - Data availability Aug 22, 1982 - Dec 14, 1993
    var Percent_Cloud = 40;
    var ls4 = ee.ImageCollection('LANDSAT/LT04/C02/T1_L2')
                .filterDate(st_time, en_time)
                .filterBounds(geo)
                .filterMetadata('CLOUD_COVER', 'less_than', Percent_Cloud)
                .map(applyScaleFactors)
                .map(cloudMaskL457)
                .select(sensor_band_dict.get('l4'), bandNames)
                .map(Harmonize54);
  
    // ------------------------------------------------------
    // Landsat 5 - Data availability Jan 1, 1984 - May 5, 2012 // missing 2003-01/04/2008
    var Percent_Cloud = 40;
    var ls5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
                .filterDate(st_time, en_time)
                .filterBounds(geo)
                .filterMetadata('CLOUD_COVER', 'less_than', Percent_Cloud)
                .map(applyScaleFactors)
                .map(cloudMaskL457)
                .select(sensor_band_dict.get('l5'), bandNames)
                .map(Harmonize54);
                  
    // Landsat 7 data are only used during operational SLC and
    // to fill the gap between the end of LS5 and the beginning
    // of LS8 data collection
                  
    // Prior to SLC-off            
    // -------------------------------------------------------
    // Landsat 7 - Data availability Jan 1, 1999 - Aug 9, 2016
    // SLC-off after 31 May 2003
    var Percent_Cloud = 40;
    var ls7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2') 
                  .filterBounds(geo)
                  .filterDate(st_time, en_time) 
                  .filterMetadata('CLOUD_COVER', 'less_than', Percent_Cloud)
                  .map(applyScaleFactors)
                  .map(cloudMaskL457)
                  .select(sensor_band_dict.get('l7'), bandNames)
                  .map(Harmonize7);
        
    // --------------------------------------------------------
    // Landsat 8 - Data availability Apr 11, 2014 - present
    var Percent_Cloud = 80;
    var ls8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')  // LANDSAT/LC08/C01/T1_SR
                  .filterBounds(geo)
                  .filterDate(st_time, en_time)
                  .filterMetadata('CLOUD_COVER', 'less_than', Percent_Cloud)
                  .map(applyScaleFactors)
                  .map(maskL8sr)
                  .select(sensor_band_dict.get('l8'), bandNames)
                  .map(Harmonize98);
     
    // --------------------------------------------------------
    // Landsat 9 - Data availability 2021-10-31 - present
    var Percent_Cloud = 80;
    var ls9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
                  .filterBounds(geo)
                  .filterDate(st_time, en_time)
                  .filterMetadata('CLOUD_COVER', 'less_than', Percent_Cloud)
                  .map(applyScaleFactors)
                  .map(maskL8sr)
                  .select(sensor_band_dict.get('l9'), bandNames)
                  .map(Harmonize98);
  
    
    // Sentinel 2
    S2 = S2.select(sensor_band_dict.get('s2'), bandNames);
    
    // Visualize for testing 
    var visualization = {
      bands: ['RED', 'GREEN', 'BLUE'],
      min: 0.0,
      max: 0.3,
    };
  
    // Merge landsat collections
    var merged_dataset = ee.ImageCollection(ls4
                  .merge(ls5)
                  .merge(ls7)
                  .merge(ls8)
                  .merge(ls9)
                  .merge(S2).sort('system:time_start'))
                  .map(geoCliper);
    
    // ---------------- >> Band Combos
    var makeBG = function(image)
    {
      var bg = image.expression(
        'BLUE / GREEN',
        {
          'GREEN': image.select('GREEN'),
          'BLUE': image.select('BLUE')
        }).rename('BG');
      return image.addBands(bg);
    };
    var makeBR = function(image)
    {
      var br = image.expression(
        'BLUE / RED',
        {
          'BLUE': image.select('BLUE'),
          'RED': image.select('RED')
        }).rename('BR');
      return image.addBands(br);
    };
    var makeBN = function(image)
    {
      var bn = image.expression(
        'BLUE / NIR',
        {
          'BLUE': image.select('BLUE'),
          'NIR': image.select('NIR')
        }).rename('BN');
      return image.addBands(bn);
    };
    var makeBS1 = function(image)
    {
      var bs1 = image.expression(
        'BLUE / SWIR1',
        {
          'BLUE': image.select('BLUE'),
          'SWIR1': image.select('SWIR1')
        }).rename('BS1');
      return image.addBands(bs1);
    };
    var makeBS2 = function(image)
    {
      var bs2 = image.expression(
        'BLUE / SWIR2',
        {
          'BLUE': image.select('BLUE'),
          'SWIR2': image.select('SWIR2')
        }).rename('BS2');
      return image.addBands(bs2);
    };
    
    var makeGR = function(image)
    {
      var gr = image.expression(
        'GREEN / RED',
        {
          'GREEN': image.select('GREEN'),
          'RED': image.select('RED')
        }).rename('GR');
      return image.addBands(gr);
    };
    var makeGN = function(image)
    {
      var gn = image.expression(
        'GREEN / NIR',
        {
          'GREEN': image.select('GREEN'),
          'NIR': image.select('NIR')
        }).rename('GN');
      return image.addBands(gn);
    };
    var makeGS1 = function(image)
    {
      var gs1 = image.expression(
        'GREEN / SWIR1',
        {
          'GREEN': image.select('GREEN'),
          'SWIR1': image.select('SWIR1')
        }).rename('GS1');
      return image.addBands(gs1);
    };
    var makeGS2 = function(image)
    {
      var gs2 = image.expression(
        'GREEN / SWIR2',
        {
          'GREEN': image.select('GREEN'),
          'SWIR2': image.select('SWIR2')
        }).rename('GS2');
      return image.addBands(gs2);
    };
    
    var makeRN = function(image)
    {
      var rn = image.expression(
        'RED / NIR',
        {
          'RED': image.select('RED'),
          'NIR': image.select('NIR')
        }).rename('RN');
      return image.addBands(rn);
    };
    var makeRS1 = function(image)
    {
      var rs1 = image.expression(
        'RED / SWIR1',
        {
          'RED': image.select('RED'),
          'SWIR1': image.select('SWIR1')
        }).rename('RS1');
      return image.addBands(rs1);
    };
    var makeRS2 = function(image)
    {
      var rs2 = image.expression(
        'RED / SWIR2',
        {
          'RED': image.select('RED'),
          'SWIR2': image.select('SWIR2')
        }).rename('RS2');
      return image.addBands(rs2);
    };
    
    var makeNS1 = function(image)
    {
      var ns1 = image.expression(
        'NIR / SWIR1',
        {
          'NIR': image.select('NIR'),
          'SWIR1': image.select('SWIR1')
        }).rename('NS1');
      return image.addBands(ns1);
    };
    var makeNS2 = function(image)
    {
      var ns2 = image.expression(
        'NIR / SWIR2',
        {
          'NIR': image.select('NIR'),
          'SWIR2': image.select('SWIR2')
        }).rename('NS2');
      return image.addBands(ns2);
    };
    
    var makeS1S2 = function(image)
    {
      var s1s2 = image.expression(
        'SWIR1 / SWIR2',
        {
          'SWIR1': image.select('SWIR1'),
          'SWIR2': image.select('SWIR2')
        }).rename('S1S2');
      return image.addBands(s1s2);
    };
    
    
    // ---------------- >> Map waters
    var makeNDSSI = function(image)
    {
      var ndssi = image.expression(
        '(BLUE - NIR) / (BLUE + NIR)',
        {
          'NIR': image.select('NIR'),
          'BLUE': image.select('BLUE')
        }).rename('NDSSI');
      return image.addBands(ndssi);
    };
    
    var makeNDWI = function(image)
    {
      var ndwi = image.expression(
        '(GREEN - NIR) / (GREEN + NIR)',
        {
          'NIR': image.select('NIR'),
          'GREEN': image.select('GREEN')
        }).rename('NDWI');
      return image.addBands(ndwi);
    };
  
    var makeaNDWI = function(image)
    {
      var andwi = image.expression(
        '((RED + GREEN + BLUE) - (NIR + SWIR1 + SWIR2)) / ((RED + GREEN + BLUE) + (NIR + SWIR1 + SWIR2))',
        {
          'BLUE': image.select('BLUE'),
          'RED': image.select('RED'),
          'NIR': image.select('NIR'),
          'GREEN': image.select('GREEN'),
          'SWIR1': image.select('SWIR1'),
          'SWIR2': image.select('SWIR2')
        }).rename('ANDWI');
      return image.addBands(andwi);
    };
    
    var makemNDWI = function(image)
    {
      var mndwi = image.expression(
        '(GREEN - SWIR1) / (GREEN + SWIR1)',
        {
          'SWIR1': image.select('SWIR1'),
          'GREEN': image.select('GREEN')
        }).rename('MNDWI');
      return image.addBands(mndwi);
    };
    
    merged_dataset = merged_dataset.map(makeaNDWI).map(makemNDWI).map(makeNDSSI).map(makeNDWI).map(waterMask)
                      .map(makeBG).map(makeBR).map(makeBN).map(makeBS1).map(makeBS2).map(makeGR).map(makeGN)
                      .map(makeGS1).map(makeGS2).map(makeRN).map(makeRS1).map(makeRS2).map(makeNS1).map(makeNS2)
                      .map(makeS1S2);
    
    return {
      merged_dataset: ee.Image(merged_dataset.mean()),
      gsw: gsw,
    };
  };