//takes previous dataset, new dataset, filters duplicates, builds OSM file with new campsite nodes

"use strict";
const turf = require("@turf/turf");
const fs = require("fs");
const geojson2osm = require('geojson2osm');
const reader = require('geojson-writer').reader
const rbush = require('geojson-rbush')

const oldTree = rbush(),
  newTree = rbush(),
  newExtents = rbush()

const oldCampsites = reader('campsites_empty.geojson')
const newCampsites = reader('campsites_sites_camping_vw_2019-10-07.geojson')

oldCampsites.features.map(camp => {
  const point = turf.point(camp.geometry.coordinates);
  oldTree.insert(point)
});

newCampsites.features.map(camp => {


  const properties = {
      'tourism': 'camp_pitch',
      'source': 'Government of Canada',

  };
  const ref = camp.properties.site_num_site;
  if(ref && ref.trim()!=''){properties['ref']=ref.trim();}
  const name_e = camp.properties.name_e
  if(name_e && name_e.trim()!=''){properties['description']=name_e.trim();}
  const name_fr = camp.properties.nom_f
  if(name_fr && name_fr.trim()!=''){properties['description:fr']=name_fr.trim();}

  const point = turf.point(camp.geometry.coordinates, properties);
  let nearby = oldTree.search(turf.circle(point.geometry.coordinates, 10, 10, 'meters')).features  //check if there was one within 10m
  if(nearby.length){
    return;
  }
  nearby = newTree.search(turf.circle(point.geometry.coordinates, 10, 10, 'meters')).features  //check if there was one within 10m
  if(nearby.length){
    return;
  }


  var circle = turf.circle(point, 200, 10, 'meters');
  nearby = newExtents.search(circle).features;
  for(let area of nearby ){
    circle = turf.union(area, circle)
    newExtents.remove(area);
  }
  newExtents.insert(circle);


  newTree.insert(point)
  console.log('New camp: ', name_e)
});

newExtents.all().features.map(camp => {
  const nearby = newTree.search(camp).features;
  if(nearby.length < 10){     //campground should have at least 10 camp sites?
    nearby.map(camp => {camp.properties['tourism']='camp_site';})
  }
});

const osm = geojson2osm.geojson2osm(newTree.all())
fs.writeFileSync('canada-new-campsites.osm', osm);
fs.writeFileSync('canada-new-campsites-extents.geojson', JSON.stringify(newExtents.all(), null, 4));
