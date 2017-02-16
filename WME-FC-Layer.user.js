// ==UserScript==
// @name         WME FC Layer
// @namespace    https://greasyfork.org/users/45389
// @version      0.2
// @description  Adds a Functional Class layer for states that publish ArcGIS FC data.
// @author       MapOMatic
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/.*$/
// @license      MIT/BSD/X11
// @require      https://cdn.jsdelivr.net/bluebird/latest/bluebird.min.js
// @grant        GM_xmlhttpRequest
// @connect      maryland.gov
// @connect      in.gov
// @connect      arcgis.com
// @connect      ncdot.gov
// @connect      state.mi.us
// @connect      dc.gov
// @connect      la.gov
// @connect      nd.gov
// @connect      pa.gov
// @connect      oh.us
// @connect      ky.gov
// ==/UserScript==

(function() {
    'use strict';

    var _settingsStoreName = 'wme_fc_layer';
    var _alertUpdate = false;
    var _debugLevel = 0;
    var _scriptVersion = GM_info.script.version;
    var _scriptVersionChanges = [
        GM_info.script.name + '\nv' + _scriptVersion + '\n\nWhat\'s New\n------------------------------\n',
        '\n- Modified how FC is retrieved from state servers to address issue where not all segments were loaded in certain states when zoomed out.',
        '\n- Added KY to the list of supported states. (updated to display US hwy as MH or mH, depending on business route classification)'
    ].join('');
    var _mapLayer = null;
    var _isAM = false;
    var _uid;
    var _styles = {};
    var _settings = {};
    var _r;
    var _mapLayerZIndex = 334;
    var _betaIDs = [103400892];
    var _statesHash = {
        'Alabama':'AL','Alaska':'AK','American Samoa':'AS','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','District of Columbia':'DC',
        'Federated States Of Micronesia':'FM','Florida':'FL','Georgia':'GA','Guam':'GU','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
        'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Marshall Islands':'MH','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO',
        'Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND',
        'Northern Mariana Islands':'MP','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Palau':'PW','Pennsylvania':'PA','Puerto Rico':'PR','Rhode Island':'RI','South Carolina':'SC',
        'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virgin Islands':'VI','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'
    };
    function reverseStatesHash(stateAbbr) {
        for (var stateName in _statesHash) {
            if (_statesHash[stateName] == stateAbbr) return stateName;
        }
    }
    var _stateSettings = {
        global: {
            roadTypes: ['St','PS','PS2','mH','MH','Ew','Rmp','Fw'], // Ew = Expressway.  For FC's that make it uncertain if they should be MH or FW.
            getFeatureRoadType: function(feature, layer) {
                var fc = feature.attributes[layer.fcPropName];
                return this.getRoadTypeFromFC(fc, layer);
            },
            getRoadTypeFromFC: function(fc, layer) {
                for (var roadType in layer.roadTypeMap) {
                    if (layer.roadTypeMap[roadType].indexOf(fc) !== -1) {
                        return roadType;
                    }
                }
                return null;
            },
            isPermitted: function(stateAbbr) {if(_betaIDs.indexOf(_uid)!==-1)return true;var state=_stateSettings[stateAbbr];if(state.isPermitted){return state.isPermitted();}else{return(_r>=2&&_isAM)||(_r>=3);}},
            getMapLayer: function(stateAbbr, layerID) {
                var returnValue;
                _stateSettings[stateAbbr].fcMapLayers.forEach(function(layer) {
                    if (layer.layerID === layerID) {
                        returnValue = layer;
                    }
                });
                return returnValue;
            }
        },
        DC: {
            baseUrl: 'http://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/',
            supportsPagination: false,
            defaultColors: {Fw:'#ff00c5',Ew:'#149ece',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [[],[],[],[],[],[],[],[],[],[],[]] },
            fetchAllFC: false,
            fcMapLayers: [
                { layerID:48, fcPropName:'FUNCTIONALCLASS', idPropName:'OBJECTID', outFields:['OBJECTID', 'FUNCTIONALCLASS'], maxRecordCount:1000, supportsPagination:false,
                 roadTypeMap:{Fw:['Interstate'],Ew:['Other Freeway and Expressway'],MH:['Principal Arterial'],mH:['Minor Arterial'],PS:['Collector']} }
            ],
            getFeatureRoadType: function(feature, layer) {
                if (layer.getFeatureRoadType) {
                    return layer.getFeatureRoadType(feature);
                } else {
                    return _stateSettings.global.getFeatureRoadType(feature, layer);
                }
            },
            getWhereClause: function(context) {
                return null;
            }
        },
        IN: {
            baseUrl: 'https://gis.in.gov/arcgis/rest/services/DOT/INDOT_LTAP/FeatureServer/',
            supportsPagination: false,
            overrideUrl: '1Sbwc7e6BfHpZWSTfU3_1otXGSxHrdDYcbn7fOf1VjpA',
            defaultColors: {Fw:'#ff00c5',Ew:'#149ece',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]], hideRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]] },
            fcMapLayers: [
                { layerID:10, idPropName:'OBJECTID', fcPropName:'FUNCTIONAL_CLASS', outFields:['FUNCTIONAL_CLASS','OBJECTID'],
                 roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:100000, supportsPagination:false }
            ],
            isPermitted: function() { return true; },
            getWhereClauses: function(context) {
            },
            getWhereClause: function(context) {
                var whereParts = [];
                if(context.mapContext.zoom < 4) {
                    whereParts.push(context.layer.fcPropName + '<>7');
                }
                whereParts.push('TO_DATE IS NULL');
                return whereParts.join(' AND ');
            },
            getFeatureRoadType: function(feature, layer) {
                if (layer.getFeatureRoadType) {
                    return layer.getFeatureRoadType(feature);
                } else {
                    return _stateSettings.global.getFeatureRoadType(feature, layer);
                }
            }
        },
        KY: {
            baseUrl: 'https://maps.kytc.ky.gov/arcgis/rest/services/BaseMap/System/MapServer/',
            supportsPagination: false,
            defaultColors: {Fw:'#ff00c5',Ew:'#ff00c5',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1] },
            fcMapLayers: [
                { layerID:0, idPropName:'OBJECTID', fcPropName:'FC', outFields:['FC','OBJECTID','RT_PREFIX', 'RT_SUFFIX'],
                 roadTypeMap:{Fw:['1'],Ew:['2'],MH:['3'],mH:['4'],PS:['5','6'],St:['7']}, maxRecordCount:1000, supportsPagination:false }
            ],
            isPermitted: function() { return true; },
            getWhereClause: function(context) {
                if(context.mapContext.zoom < 4) {
                    return context.layer.fcPropName + "<>'7'";
                } else {
                    return null;
                }
            },
            getFeatureRoadType: function(feature, layer) {
                if (feature.attributes.RT_PREFIX === 'US') {
                    var suffix = feature.attributes.RT_SUFFIX;
                    return suffix.indexOf('X') === -1 ? 'MH' : 'mH';
                } else {
                    return _stateSettings.global.getFeatureRoadType(feature, layer);
                }
            }
        },
        LA: {
            baseUrl: 'http://gisweb.dotd.la.gov/ArcGIS/rest/services/LADOTDAGO/LA_RoadwayFunctionalClassification/MapServer/',
            supportsPagination: false,
            defaultColors: {Fw:'#ff00c5',Ew:'#5f33df',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]] },
            fcMapLayers: [
                { layerID:0, fcPropName:'Functional_System', idPropName:'OBJECTID', outFields:['OBJECTID','Functional_System','State_Route'], roadTypeMap:{Fw:[1],Ew:['2','2a','2b'],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:1000, supportsPagination:false },
                { layerID:1, fcPropName:'Functional_System', idPropName:'OBJECTID', outFields:['OBJECTID','Functional_System','State_Route'], roadTypeMap:{Fw:[1],Ew:['2','2a','2b'],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:1000, supportsPagination:false },
                { layerID:2, fcPropName:'Functional_System', idPropName:'OBJECTID', outFields:['OBJECTID','Functional_System','State_Route'], roadTypeMap:{Fw:[1],Ew:['2','2a','2b'],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:1000, supportsPagination:false },
                { layerID:3, fcPropName:'Functional_System', idPropName:'OBJECTID', outFields:['OBJECTID','Functional_System','State_Route'], roadTypeMap:{Fw:[1],Ew:['2','2a','2b'],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:1000, supportsPagination:false },
                { layerID:4, fcPropName:'Functional_System', idPropName:'OBJECTID', outFields:['OBJECTID','Functional_System','State_Route'], roadTypeMap:{Fw:[1],Ew:['2','2a','2b'],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:1000, supportsPagination:false },
                { layerID:5, fcPropName:'Functional_System', idPropName:'OBJECTID', outFields:['OBJECTID','Functional_System','State_Route'], roadTypeMap:{Fw:[1],Ew:['2','2a','2b'],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:1000, supportsPagination:false },
                { layerID:6, fcPropName:'Functional_System', idPropName:'OBJECTID', outFields:['OBJECTID','Functional_System','State_Route'], roadTypeMap:{Fw:[1],Ew:['2','2a','2b'],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:1000, supportsPagination:false },
            ],
            getWhereClause: function(context) {
                if(context.mapContext.zoom < 4) {
                    return context.layer.fcPropName + '<>7';
                } else {
                    return null;
                }
            },
            getFeatureRoadType: function(feature, layer) {
                var fc = feature.attributes[layer.fcPropName];
                if (fc === '2a' || fc === '2b') { fc = 2; }
                fc = parseInt(fc);
                var stateRoute = feature.attributes.State_Route;
                var isBusiness = /BUS$/.test(stateRoute);
                if (fc > 3 && /^US\s/.test(stateRoute) && !isBusiness) {
                    fc = 3;
                } else if (fc > 4 && /^LA\s/.test(stateRoute) && !isBusiness) {
                    fc = 4;
                }
                return _stateSettings.global.getRoadTypeFromFC(fc, layer);
            }
        },
        MD: {
            baseUrl: 'http://www.maps.roads.maryland.gov/arcgis/rest/services/TRANSPORTATION/FunctionClassUpdates/MapServer/',
            defaultColors: {Fw:'#ff00c5',Ew:'#4f33df',MH:'#149ece',mH:'#4ce600',PS:'#ffff00',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]] },
            fcMapLayers: [
                { layerID:0, fcPropName:'F_SYSTEM', idPropName:'FID', outFields:['FID','F_SYSTEM','ID_PREFIX','MP_SUFFIX'], roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:1000, supportsPagination:false }
            ],
            getWhereClause: function(context) {
                if(context.mapContext.zoom < 4) {
                    return "(F_SYSTEM < 7 OR ID_PREFIX IN('MD','SR'))";
                } else {
                    return null;
                }
            },
            getFeatureRoadType: function(feature,layer) {
                var attr = feature.attributes;
                var fc = parseInt(attr.F_SYSTEM);
                var isState = attr.ID_PREFIX === 'MD';
                var isUS = attr.ID_PREFIX === 'US';
                var isBusiness = attr.MP_SUFFIX === 'BU';
                if (fc > 4 && isState) { fc = (isBusiness ? Math.min(fc,5) : 4); }
                else if (fc > 3 && isUS) { fc = (isBusiness ? Math.min(fc, 4) : 3 );}
                return _stateSettings.global.getRoadTypeFromFC(fc, layer);
            }
        },
        MI: {
            baseUrl: 'http://gisp.mcgi.state.mi.us/arcgis/rest/services/MDOT/NFC/MapServer/',
            defaultColors: {Fw:'#ff00c5',Ew:'#149ece',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]] },
            fcMapLayers: [
                { layerID:2, idPropName:'OBJECTID', fcPropName:'NFC', outFields:['NFC'], roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]}, maxRecordCount:1000, supportsPagination:false }
            ],
            isPermitted: function() { return true; },
            getWhereClause: function(context) {
                if(context.mapContext.zoom < 4) {
                    return context.layer.fcPropName + '<>7';
                } else {
                    return null;
                }
            },
            getFeatureRoadType: function(feature, layer) {
                if (layer.getFeatureRoadType) {
                    return layer.getFeatureRoadType(feature);
                } else {
                    return _stateSettings.global.getFeatureRoadType(feature, layer);
                }
            }
        },
        NC: {
            baseUrl: 'https://gis11.services.ncdot.gov/arcgis/rest/services/NCDOT_FunctionalClass/MapServer/',
            defaultColors: {Fw:'#ff00c5',Rmp:'#999999',Ew:'#5f33df',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]] },
            fcMapLayers: [
                { layerID:0, fcPropName:'FC_TYP_CD', idPropName:'OBJECTID', outFields:['OBJECTID','FC_TYP_CD','RTE_1_CLSS_CD'], roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]}, zoomLevels:[3,4,5,6,7,8,9,10], maxRecordCount:1000, supportsPagination:false },
                //{ layerID:2, fcPropName:'FC_TYP_CD', idPropName:'OBJECTID', outFields:['OBJECTID','FC_TYP_CD','RTE_1_CLSS_CD'], roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]}, zoomLevels:[2], maxRecordCount:1000, supportsPagination:false },
                //{ layerID:3, fcPropName:'FC_TYP_CD', idPropName:'OBJECTID', outFields:['OBJECTID','FC_TYP_CD','RTE_1_CLSS_CD'], roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]}, zoomLevels:[0,1], maxRecordCount:1000, supportsPagination:false },
                //{ layerID:4, fcPropName:'FC_TYP_CD', idPropName:'OBJECTID', outFields:['OBJECTID','FC_TYP_CD','RTE_1_CLSS_CD'], roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]}, zoomLevels:[], maxRecordCount:1000, supportsPagination:false },
                //{ layerID:5, fcPropName:'FC_TYP_CD', idPropName:'OBJECTID', outFields:['OBJECTID','FC_TYP_CD','RTE_1_CLSS_CD'], roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]}, zoomLevels:[], maxRecordCount:1000, supportsPagination:false },
                //{ layerID:6, fcPropName:'FC_TYP_CD', idPropName:'OBJECTID', outFields:['OBJECTID','FC_TYP_CD','RTE_1_CLSS_CD'], roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]}, zoomLevels:[], maxRecordCount:1000, supportsPagination:false }
            ],
            isPermitted: function() { return _r > 1; },
            getWhereClause: function(context) {
                if(context.mapContext.zoom < 4) {
                    var clause = '(' + context.layer.fcPropName + " < 7 OR RTE_1_CLSS_CD IN ('I','FED','NC','RMP','US'))";
                    return clause;
                } else {
                    return null;
                }
            },
            getFeatureRoadType: function(feature, layer) {
                var fc = feature.attributes[layer.fcPropName];
                var roadType;
                switch (this.getHwySys(feature)) {
                    case 'interstate':
                        roadType = 'Fw';
                        break;
                    case 'us':
                        roadType = fc <= 2 ? 'Ew' : 'MH';
                        break;
                    case 'state':
                        roadType = fc === 2 ? 'Ew' : (fc === 3 ? 'MH' : 'mH');
                        break;
                    case 'ramp':
                        roadType = 'Rmp';
                        break;
                    default:
                        roadType = fc === 2 ? 'Ew' : (fc === 3 ? 'MH' : (fc === 4 ? 'mH' : (fc <= 6 ? 'PS' : 'St')));
                }
                return roadType;
            },
            getHwySys: function(feature) {
                var hwySys;
                switch (feature.attributes.RTE_1_CLSS_CD) {
                    case 'I':
                        hwySys = 'interstate';
                        break;
                    case 'FED':
                    case 'US':
                        hwySys = 'us';
                        break;
                    case 'NC':
                        hwySys = 'state';
                        break;
                    case 'RMP':
                        hwySys = 'ramp';
                        break;
                    default:
                        hwySys = 'local';
                }
                return hwySys;
            }
        },
        ND: {
            baseUrl: 'https://gis.dot.nd.gov/arcgis/rest/services/external/transinfo/MapServer/',
            defaultColors: {Fw:'#ff00c5',Ew:'#149ece',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]] },
            fcMapLayers: [
                { layerID:10, fcPropName:'FUNCTION_CLASS', idPropName:'OBJECTID', outFields:['OBJECTID','FUNCTION_CLASS'], roadTypeMap:{FW:['Interstate'],MH:['Principal Arterial'],mH:['Minor Arterial'],PS:['Major Collector','Collector'],St:['Local']},
                 maxRecordCount:1000, supportsPagination:false},
                { layerID:11, fcPropName:'FUNCTION_CLASS', idPropName:'OBJECTID', outFields:['OBJECTID','FUNCTION_CLASS'], roadTypeMap:{FW:['Interstate'],MH:['Principal Arterial'],mH:['Minor Arterial'],PS:['Major Collector','Collector'],St:['Local']},
                 maxRecordCount:1000, supportsPagination:false,},
                { layerID:12, fcPropName:'FUNCTION_CLASS', idPropName:'OBJECTID', outFields:['OBJECTID','FUNCTION_CLASS'], roadTypeMap:{PS:['Major Collector','Collector']},
                 maxRecordCount:1000, supportsPagination:false,},
                { layerID:16, fcPropName:'SYSTEM_CD', idPropName:'OBJECTID', outFields:['OBJECTID','SYSTEM_CD','SYSTEM_DESC','HIGHWAY'], roadTypeMap:{Fw:[1,11],MH:[2,14],mH:[6,7,16,19]},
                 maxRecordCount:1000, supportsPagination:false,}
            ],
            getWhereClause: function(context) {
                if(context.mapContext.zoom < 4) {
                    if (context.layer.layerID !== 16) return context.layer.fcPropName + "<>'Local'";
                } else {
                    return null;
                }
            },
            getFeatureRoadType: function(feature, layer) {
                return _stateSettings.global.getFeatureRoadType(feature, layer);
            }
        },
        OH: {
            baseUrl: 'http://odotgis.dot.state.oh.us/arcgis/rest/services/TIMS/Roadway_Information/MapServer/',
            defaultColors: {Fw:'#ff00c5',Ew:'#4f33df',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]] },

            fcMapLayers: [
                { layerID:9, fcPropName:'FUNCTION_CLASS', idPropName:'ObjectID', outFields:['FUNCTION_CLASS','ROUTE_TYPE','ROUTE_NBR','NLF_ID','ObjectID'],
                 maxRecordCount:1000, supportsPagination:false, roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]} }
            ],
            isPermitted: function() { return true; },
            getWhereClause: function(context) {
                if(context.mapContext.zoom < 4) {
                    var clause = '(' + context.layer.fcPropName + " < 7 OR ROUTE_TYPE IN ('CR','SR','US'))";
                    return clause;
                } else {
                    return null;
                }
            },
            getFeatureRoadType: function(feature, layer) {
                var fc = feature.attributes[layer.fcPropName];
                var prefix = feature.attributes.ROUTE_TYPE;
                var isUS = prefix === 'US';
                var isState = prefix === 'SR';
                var isCounty = prefix === 'CR';
                if (isUS && fc > 3) { fc = 3; }
                if (isState && fc > 4) { fc = 4; }
                if (isCounty && fc > 6) { fc = 6; }
                return _stateSettings.global.getRoadTypeFromFC(fc, layer);
            }
        },
        PA: {
            baseUrl: 'https://services1.arcgis.com/jOy9iZUXBy03ojXb/ArcGIS/rest/services/RMS_SEG_ADMIN/FeatureServer/',
            supportsPagination: false,
            defaultColors: {Fw:'#ff00c5',Ew:'#4f33df',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',PS2:'#dfae3e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]] },
            isPermitted: function() { return _r >= 3; },
            fcMapLayers: [
                { layerID:0, features:new Map(), fcPropName:'FUNC_CLS', idPropName:'OBJECTID', outFields:['OBJECTID','FUNC_CLS','ST_RT_NO','TRAF_RT_NO_PREFIX','TRAF_RT_NO','TRAF_RT_NO_SUF','STREET_NAME'],
                 maxRecordCount:1000, supportsPagination:false, roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5],PS2:[6],St:[7,99]} },
            ],
            getWhereClause: function(context) {
                if(context.mapContext.zoom < 4) {
                    return "(FUNC_CLS <7 OR TRAF_RT_NO_PREFIX IN ('PA','US','SR') OR ST_RT_NO > 999)";
                } else {
                    return null;
                }
            },
            getFeatureHwySys(feature, layer) {
                var attr = feature.attributes;
                var prefix = attr.TRAF_RT_NO_PREFIX;
                var suffix = attr.TRAF_RT_NO_SUF;
                var st_rt_no = Number(attr.ST_RT_NO);
                var traf_rt_no = Number(attr.TRAF_RT_NO);
                var rt_no = traf_rt_no === 0 ? st_rt_no : traf_rt_no;
                var isInterstate = prefix === 'I';
                var isUS = prefix === 'US';
                var isPA = prefix === 'PA';
                var isState = isPA || !(isInterstate || isUS);
                var isBusiness = suffix === 'B';
                var is4DigitRoute = rt_no > 999;

                var hwySys;
                if (isInterstate) {
                    hwySys = isBusiness ? 'interstate-bus' : 'interstate' ;
                } else if (isUS) {
                    hwySys = isBusiness ? 'us-bus' : 'us';
                } else if (isState) {
                    hwySys = !is4DigitRoute && isPA ? 'state-shielded' : 'state-unshielded';
                } else {
                    hwySys = 'local';
                }
                attr.calculatedProps = {
                    hwySys: hwySys,
                    prefix: prefix,
                    suffix: suffix,
                    rt_no: rt_no,
                    isInterstate: isInterstate,
                    isUS: isUS,
                    isPA: isPA,
                    isState: isState,
                    isBusiness: isBusiness,
                    is4DigitRoute: is4DigitRoute
                };
                return hwySys;
            },
            getFeatureRoadType: function(feature, layer) {
                var hwySys = this.getFeatureHwySys(feature, layer);
                var fc = parseInt(feature.attributes.FUNC_CLS);
                var roadType;
                switch (fc) {
                    case 1:
                        roadType = 'Fw';
                        break;
                    case 2:
                        roadType = 'Ew';
                        break;
                    case 3:
                        roadType = 'MH';
                        break;
                    default:
                        if ((hwySys === 'interstate-bus') || (hwySys === 'us')) {
                            roadType = 'MH';
                        } else if ((hwySys === 'us-bus') || (hwySys === 'state-shielded')) {
                            roadType = 'mH';
                        } else if (hwySys === 'state-unshielded') {
                            roadType = 'PS2';
                        } else if ((hwySys === 'local') && (fc > 5)) {
                            roadType = 'St';
                        } else {
                            roadType = 'PS';
                        }
                        break;
                }
                return roadType;
            }
        },
        VA: {
            baseUrl: 'http://services.arcgis.com/p5v98VHDX9Atv3l7/arcgis/rest/services/FC_2014_FHWA_Submittal1/FeatureServer/',
            defaultColors: {Fw:'#ff00c5',Ew:'#ff00c5',MH:'#149ece',mH:'#4ce600',PS:'#cfae0e',St:'#eeeeee'},
            zoomSettings: { maxOffset: [30,15,8,4,2,1,1,1,1,1], excludeRoadTypes: [['St'],['St'],['St'],['St'],[],[],[],[],[],[],[]] },
            fcMapLayers: [
                { layerID:0, fcPropName:'FUNCTIONAL_CLASS_ID', idPropName:'OBJECTID', outFields:['OBJECTID','FUNCTIONAL_CLASS_ID','RTE_NM'], maxRecordCount:2000, supportsPagination:true, roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]} },
                { layerID:1, fcPropName:'STATE_FUNCT_CLASS_ID', idPropName:'OBJECTID', outFields:['OBJECTID','STATE_FUNCT_CLASS_ID','RTE_NM','ROUTE_NO'], maxRecordCount:2000, supportsPagination:true, roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]} },
                { layerID:3, fcPropName:'TMPD_FC', idPropName:'OBJECTID', outFields:['OBJECTID','TMPD_FC','RTE_NM'], maxRecordCount:2000, supportsPagination:true, roadTypeMap:{Fw:[1],Ew:[2],MH:[3],mH:[4],PS:[5,6],St:[7]} }
            ],
            srExceptions: [217,302,303,305,308,310,313,314,315,317,318,319,320,321,322,323,324,325,326,327,328,329,330,331,332,333,334,335,336,339,341,342,343,344,345,346,347,348,350,353,355,357,358,361,362,363,364,365,366,367,368,369,370,371,372,373,374,375,376,377,378,379,382,383,384,385,386,387,388,389,390,391,392,393,394,396,397,398,399,785,895],
            getWhereClause: function(context) {
                if(context.mapContext.zoom < 4) {
                    return context.layer.fcPropName + '<>7';
                } else {
                    //NOTE: As of 9/14/2016 there does not appear to be any US/SR/VA labeled routes with FC = 7.
                    return null;
                }
            },
            getFeatureRoadType: function(feature, layer) {
                if (layer.getFeatureRoadType) {
                    return layer.getFeatureRoadType(feature);
                } else {
                    var fc = parseInt(feature.attributes[layer.fcPropName]);
                    var rtName = feature.attributes.RTE_NM;
                    var match = /^R-VA\s*(US|VA|SR)(\d{5})..(BUS)?/.exec(rtName);
                    var isBusiness = (match && (match !== null) && (match[3] === 'BUS'));
                    var isState = (match && (match !== null) && (match[1] === 'VA' || match[1] === 'SR'));
                    var rtNum = parseInt((layer.layerID === 1) ? feature.attributes.ROUTE_NO : (match ? match[2] : 99999));
                    var rtPrefix = match && match[1];
                    if (fc > 3 && rtPrefix === 'US') {
                        fc = isBusiness ? 4 : 3;
                    } else if (isState && fc > 4 && this.srExceptions.indexOf(rtNum) === -1 && rtNum < 600) {
                        fc = isBusiness ? 5 : 4;
                    }
                    return _stateSettings.global.getRoadTypeFromFC(fc, layer);
                }
            }
        }
    };

    function log(message, level) {
        if (message && (!level || (level <= _debugLevel))) {
            console.log('FC Layer: ', message);
        }
    }

    function generateUUID() {
        var d = new Date().getTime();
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (d + Math.random()*16)%16 | 0;
            d = Math.floor(d/16);
            return (c=='x' ? r : (r&0x3|0x8)).toString(16);
        });
        return uuid;
    }

    function loadSettingsFromStorage() {
        var loadedSettings = $.parseJSON(localStorage.getItem(_settingsStoreName));
        var defaultSettings = {
            lastVersion:null,
            layerVisible:true,
            activeStateAbbr:'ALL',
            hideStreet:false
        };
        _settings = loadedSettings ? loadedSettings : defaultSettings;
        for (var prop in defaultSettings) {
            if (!_settings.hasOwnProperty(prop)) {
                _settings[prop] = defaultSettings[prop];
            }
        }
    }

    function saveSettingsToStorage() {
        if (localStorage) {
            _settings.lastVersion = _scriptVersion;
            localStorage.setItem(_settingsStoreName, JSON.stringify(_settings));
            log('Settings saved', 1);
        }
    }

    function getLineWidth() {
        return 12 * Math.pow(1.15, (Waze.map.getZoom()-1));
    }

    function sortArray(array) {
        array.sort(function(a, b){if (a < b)return -1;if (a > b)return 1;else return 0;});
    }

    function getVisibleStateAbbrs() {
        var visibleStates = [];
        Waze.model.states.additionalInfo.forEach(function(state) {
            var stateAbbr = _statesHash[state.name];
            var activeStateAbbr = _settings.activeStateAbbr;
            if(_stateSettings[stateAbbr] && _stateSettings.global.isPermitted(stateAbbr) && (!activeStateAbbr || activeStateAbbr === 'ALL' || activeStateAbbr === stateAbbr)) {
                visibleStates.push(stateAbbr);
            }
        });
        return visibleStates;
    }

    function getAsync(url, context) {
        return new Promise(function(resolve, reject) {
            GM_xmlhttpRequest({
                context:context, method:"GET", url:url,
                onload:function(res) {
                    if (res.status == 200) {
                        resolve({responseText: res.responseText, context:context});
                    } else {
                        reject({responseText: res.responseText, context:context});
                    }
                },
                onerror: function() {
                    reject(Error("Network Error"));
                }
            });
        });
    }

    function getUrl(context, queryType, queryParams) {
        var extent = context.mapContext.extent,
            zoom = context.mapContext.zoom,
            layer = context.layer,
            state = context.state;

        var whereParts = [];
        var geometry = { xmin:extent.left, ymin:extent.bottom, xmax:extent.right, ymax:extent.top, spatialReference: {wkid: 102100, latestWkid: 3857} };
        var geometryStr = JSON.stringify(geometry);
        var stateWhereClause = state.getWhereClause(context);
        var url = state.baseUrl + layer.layerID + '/query?geometry=' + encodeURIComponent(geometryStr);

        if (queryType === 'countOnly') {
            url += '&returnCountOnly=true';
        } else if (queryType === 'idsOnly') {
            url += '&returnIdsOnly=true';
        } else if (queryType === 'paged') {
            // TODO
        } else {
            url += '&returnGeometry=true&maxAllowableOffset=' + state.zoomSettings.maxOffset[zoom];
            url += '&outFields=' + encodeURIComponent(layer.outFields.join(','));
            if (queryType === 'idRange') {
                var idPropName = context.layer.idPropName;
                whereParts.push('(' + queryParams.idFieldName + '>=' + queryParams.range[0] + ' AND ' + queryParams.idFieldName + '<=' + queryParams.range[1] + ')');
            }
        }
        if (stateWhereClause) whereParts.push(stateWhereClause);
        if (whereParts.length > 0 ) url += '&where=' + encodeURIComponent(whereParts.join(' AND '));
        url += '&spatialRel=esriSpatialRelIntersects&geometryType=esriGeometryEnvelope&inSR=102100&outSR=3857&f=json';
        return url;
    }

    function convertFcToRoadTypeVectors(feature, state, stateAbbr, layer, zoom) {
        var roadType = state.getFeatureRoadType(feature, layer);
        log(feature,3);
        var zIndex = _stateSettings.global.roadTypes.indexOf(roadType) * 100;
        var vectors = [];
        var lineFeatures = [];
        var attr = {
            //fcFeatureUniqueId: stateAbbr + '-' + layer.layerID + '-' + feature.attributes[layer.idPropName],
            //fcFeatureId: feature.attributes[layer.idPropName],
            state: stateAbbr,
            layerID: layer.layerID,
            roadType: roadType,
            dotAttributes: $.extend({}, feature.attributes),
            color: state.defaultColors[roadType],
            strokeWidth: getLineWidth,
            zIndex: zIndex
        };

        feature.geometry.paths.forEach(function(path){
            var pointList = [];
            var newPoint = null;
            var lastPoint = null;
            path.forEach(function(point){
                pointList.push(new OpenLayers.Geometry.Point(point[0],point[1]));
            });
            var vectorFeature = new OpenLayers.Feature.Vector(new OpenLayers.Geometry.LineString(pointList),attr);
            vectors.push(vectorFeature);
        });

        return vectors;
    }

    function fetchLayerFC(context) {
        var url = getUrl(context, 'idsOnly');
        log(url,2);
        if (!context.parentContext.cancel) {
            return getAsync(url, context).bind(context).then(function(res) {
                var ids = $.parseJSON(res.responseText);
                if(!ids.objectIds) ids.objectIds = [];
                sortArray(ids.objectIds);
                log(ids,2);
                return ids;
            }).then(function(res) {
                var context = this;
                var idRanges = [];
                if (res.objectIds) {
                    var len = res.objectIds ? res.objectIds.length : 0;
                    var currentIndex = 0;
                    var offset = Math.min(this.layer.maxRecordCount,1000);
                    while (currentIndex < len) {
                        var nextIndex = currentIndex + offset;
                        if (nextIndex >= len) nextIndex = len - 1;
                        idRanges.push({range:[res.objectIds[currentIndex], res.objectIds[nextIndex]], idFieldName:res.objectIdFieldName});
                        currentIndex = nextIndex + 1;
                    }
                    log(idRanges,2);
                }
                return idRanges;
            }).map(function(idRange) {
                var context = this;
                if(!context.parentContext.cancel) {
                    var url = getUrl(this, 'idRange', idRange);
                    log(url,2);
                    return getAsync(url, context).then(function(res) {
                        var context = res.context;
                        if(!context.parentContext.cancel) {
                            var features = $.parseJSON(res.responseText).features;
                            // if (context.parentContext.callCount === 0 ) {
                            //     _mapLayer.removeAllFeatures();
                            // }
                            context.parentContext.callCount++;
                            log('Feature Count=' + (features ? features.length : 0),2);
                            features = features ? features : [];
                            var vectors = [];
                            features.forEach(function(feature) {
                                if(!res.context.parentContext.cancel) {
                                    var vector = convertFcToRoadTypeVectors(feature, context.state, context.stateAbbr, context.layer, context.mapContext.zoom);
                                    //var fcFeatureUniqueId = vector[0].attributes.fcFeatureUniqueId;
                                    //context.parentContext.addedFcFeatureUniqueIds.push(fcFeatureUniqueId);
                                    if (/*!context.parentContext.existingFcFeatureUniqueIds[fcFeatureUniqueId] &&*/ !(vector[0].attributes.roadType === 'St' && _settings.hideStreet)) {
                                        vectors.push(vector);
                                    }
                                }
                            });
                            return vectors;
                        }
                    });
                } else {
                    log('Async call cancelled',1);
                }
            });
        }
    }

    function fetchStateFC(context) {
        var state = _stateSettings[context.stateAbbr];
        var contexts = [];
        state.fcMapLayers.forEach(function(layer) {
            contexts.push({parentContext:context.parentContext, layer:layer, state:state, stateAbbr:context.stateAbbr, mapContext:context.mapContext});
        });
        return Promise.map(contexts, function(context) {
            return fetchLayerFC(context);
        });
    }

    var _lastPromise = null;
    var _lastContext = null;
    var _fcCallCount = 0;
    function fetchAllFC() {
        if (_lastPromise) { _lastPromise.cancel(); }
        $('#fc-loading-indicator').text('Loading FC...');

        var mapContext = { zoom:Waze.map.getZoom(), extent:Waze.map.getExtent() };
        var contexts = [];
        var parentContext = {callCount:0,/*existingFcFeatureUniqueIds:{}, addedFcFeatureUniqueIds:[],*/ startTime:Date.now()};
        // _mapLayer.features.forEach(function(vectorFeature) {
        //     var fcFeatureUniqueId = vectorFeature.attributes.fcFeatureUniqueId;
        //     var existingFcFeatureUniqueIdArray = parentContext.existingFcFeatureUniqueIds[fcFeatureUniqueId];
        //     if (!existingFcFeatureUniqueIdArray) {
        //         existingFcFeatureUniqueIdArray = [];
        //         parentContext.existingFcFeatureUniqueIds[fcFeatureUniqueId] = existingFcFeatureUniqueIdArray;
        //     }
        //     existingFcFeatureUniqueIdArray.push(vectorFeature);
        // });
        if (_lastContext) _lastContext.cancel = true;
        _lastContext = parentContext;
        getVisibleStateAbbrs().forEach(function(stateAbbr) {
            contexts.push({ parentContext:parentContext, stateAbbr:stateAbbr, mapContext:mapContext});
        });
        var map = Promise.map(contexts, function(context) {
            return fetchStateFC(context);
        }).bind(parentContext).then(function(statesVectorArrays) {
            if (!this.cancel) {
                _mapLayer.removeAllFeatures();
                statesVectorArrays.forEach(function(vectorsArray) {
                    vectorsArray.forEach(function(vectors) {
                        vectors.forEach(function(vector) {
                            vector.forEach(function(vectorFeature) {
                                _mapLayer.addFeatures(vectorFeature);
                            });
                        });
                    });
                });
                // for(var fcFeatureUniqueId in this.existingFcFeatureUniqueIds) {
                //     if(this.addedFcFeatureUniqueIds.indexOf(fcFeatureUniqueId) === -1) {
                //         if (!this.cancel) _mapLayer.removeFeatures(this.existingFcFeatureUniqueIds[fcFeatureUniqueId]);
                //     }
                // }
                log('TOTAL RETRIEVAL TIME = ' + (Date.now() - parentContext.startTime),1);
                log(statesVectorArrays,1);
            }
            return statesVectorArrays;
        }).catch(function(e) {
            $('#fc-loading-indicator').text('FC Error! (check console for details)');
            log(e,0);
        }).finally(function() {
            _fcCallCount -= 1;
            if (_fcCallCount === 0) {
                $('#fc-loading-indicator').text('');
            }
        });

        _fcCallCount += 1;
        _lastPromise = map;
    }

    function onLayerVisibilityChanged(evt) {
        _settings.layerVisible = _mapLayer.visibility;
        saveSettingsToStorage();
    }

    function onModeChanged(model, modeId, context) {
        if(!modeId || modeId === 1) {
            initUserPanel();
        }
    }

    function showScriptInfoAlert() {
        /* Check version and alert on update */
        if (_alertUpdate && _scriptVersion !== _settings.lastVersion) {
            alert(_scriptVersionChanges);
        }
    }

    function initLayer(){
        var _drawingContext = {
            getZIndex: function(feature) {
                return feature.attributes.zIndex;
            },
            getStrokeWidth: function() { return getLineWidth(); }
        };
        var defaultStyle = new OpenLayers.Style({
            strokeColor: '${color}', //'#00aaff',
            strokeDashstyle: "solid",
            strokeOpacity: 0.5,
            strokeWidth: '${strokeWidth}',
            graphicZIndex: '${zIndex}'
        });

        var selectStyle = new OpenLayers.Style({
            //strokeOpacity: 1.0,
            strokeColor: '#000000'
        });

        _mapLayer = new OpenLayers.Layer.Vector("FC Layer", {
            uniqueName: "__FCLayer",
            displayInLayerSwitcher: false,
            rendererOptions: { zIndexing: true },
            styleMap: new OpenLayers.StyleMap({
                'default': defaultStyle,
                'select': selectStyle
            })
        });

        I18n.translations.en.layers.name.__FCLayer = "FC Layer";

        _mapLayer.displayInLayerSwitcher = true;
        _mapLayer.events.register('visibilitychanged',null,onLayerVisibilityChanged);
        _mapLayer.setVisibility(_settings.layerVisible);

        Waze.map.addLayer(_mapLayer);
        _mapLayer.setZIndex(_mapLayerZIndex);

        // Hack to fix layer zIndex.  Some other code is changing it sometimes but I have not been able to figure out why.
        // It may be that the FC layer is added to the map before some Waze code loads the base layers and forces other layers higher. (?)

        var checkLayerZIndex = function(layerZIndex) {
            if (_mapLayer.getZIndex() != _mapLayerZIndex)  {
                log("ADJUSTED FC LAYER Z-INDEX",1);
                _mapLayer.setZIndex(_mapLayerZIndex);
            }
        };

        setInterval(function(){checkLayerZIndex(_mapLayerZIndex);}, 200);

        Waze.map.events.register("moveend",Waze.map,function(e){
            fetchAllFC();
            return true;
        },true);
    }

    function initUserPanel() {
        var $tab = $('<li>').append($('<a>', {'data-toggle':'tab', href:'#sidepanel-fc-layer'}).text('FC'));
        var $panel = $('<div>', {class:'tab-pane', id:'sidepanel-fc-layer'});
        var $stateSelect = $('<select>', {id:'fcl-state-select',class:'form-control disabled',style:'disabled'}).append($('<option>', {value:'ALL'}).text('All'));
        // $stateSelect.change(function(evt) {
        //     _settings.activeStateAbbr = evt.target.value;
        //     saveSettingsToStorage();
        //     _mapLayer.removeAllFeatures();
        //     fetchAllFC();
        // });
        for (var stateAbbr in _stateSettings) {
            if (stateAbbr !== 'global') {
                $stateSelect.append($('<option>', {value:stateAbbr}).text(reverseStatesHash(stateAbbr)));
            }
        }

        var $hideStreet =  $('<div>',{class:'controls-container'})
        .append($('<input>', {type:'checkbox',name:'fcl-hide-street',id:'fcl-hide-street'}).prop('checked', _settings.hideStreet).click(function() {
            _settings.hideStreet = $(this).is(':checked');
            saveSettingsToStorage();
            _mapLayer.removeAllFeatures();
            fetchAllFC();
        }))
        .append($('<label>', {for:'fcl-hide-street'}).text('Hide street highlights'));

        $stateSelect.val(_settings.activeStateAbbr ? _settings.activeStateAbbr : 'ALL');

        $panel.append(
            $('<div>',  {class:'side-panel-section>'}).append(
                $('<div>', {class:'form-group'}).append(
                    $('<label>', {class:'control-label'}).text('Select a state')
                ).append(
                    $('<div>', {class:'controls', id:'fcl-state-select-container'}).append(
                        $('<div>').append($stateSelect)
                    )
                )
            ).append($hideStreet )
        );

        $panel.append(
            $('<div>',{style:'margin-top:10px;font-size:10px;color:#999999;'})
            .append($('<div>').text('version ' + _scriptVersion))
            .append(
                $('<div>').append(
                    $('<a>',{href:'#' /*, target:'__blank'*/}).text('Discussion Forum (currently n/a)')
                )
            )
        );

        $('#user-tabs > .nav-tabs').append($tab);
        $('#user-info > .flex-parent > .tab-content').append($panel);
        $('#fcl-state-select').change(function () {
            _settings.activeStateAbbr = this.value;
            saveSettingsToStorage();
            fetchAllFC();
        });
    }

    function addLoadingIndicator() {
        $('.loading-indicator').after($('<div class="loading-indicator" style="margin-right:10px" id="fc-loading-indicator">'));
    }

    function initGui() {
        addLoadingIndicator();
        initLayer();
        initUserPanel();
        showScriptInfoAlert();
    }

    function processText(text) {
        return new Promise(function(resolve, reject) {
            var newText = text.replace(/(e)/,'E');
            resolve(newText);
        });
    }

    function init() {
        if (_debugLevel > 0 && Promise.config) {
            Promise.config({
                warnings: true,
                longStackTraces: true,
                cancellation: true,
                monitoring: true
            });
        }

        var u = Waze.loginManager.user;
        _uid = u.id;
        _r = u.rank;
        _isAM = u.isAreaManager;
        loadSettingsFromStorage();
        String.prototype.replaceAll = function(search, replacement) {
            var target = this;
            return target.replace(new RegExp(search, 'g'), replacement);
        };
        initGui();
        Waze.app.modeController.model.bind('change:mode', onModeChanged);
        Waze.prefs.on("change:isImperial", function() {initUserPanel();loadSettingsFromStorage();});
        fetchAllFC();
        log('Initialized.', 0);
    }

    function bootstrap() {
        if (Waze && Waze.loginManager &&
            Waze.loginManager.events &&
            Waze.loginManager.events.register &&
            Waze.model && Waze.model.states && Waze.model.states.additionalInfo &&
            Waze.map && Waze.loginManager.isLoggedIn()) {
            log('Initializing...', 0);

            init();
        } else {
            log('Bootstrap failed. Trying again...', 0);
            unsafeWindow.setTimeout(function () {
                bootstrap();
            }, 1000);
        }
    }

    log('Bootstrap...', 0);
    bootstrap();
})();