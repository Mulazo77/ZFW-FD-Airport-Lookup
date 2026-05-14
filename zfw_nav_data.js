// ZFW waypoint/navaid database.
// Populate this file from FAA NASR FIX/NAV public data using build_zfw_nav_weather_data.py.
// The app treats every entry here exactly like an airport lookup record.
// Format: window.ZFW_NAV_DATA = {"IDENT": {sectors:[], areas:[], apps:[], vscs:[], contacts:[], hours:[], airport_name:"NAME", lat:0, lon:0, record_type:"FIX|NAVAID"}};
window.ZFW_NAV_DATA = {};
