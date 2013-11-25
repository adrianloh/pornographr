#!/usr/bin/env node

var path = require("path"),
	express = require('express'),
	server = express();

var api_key="fdfd759b5d6dc97444c0757cd51b730e",
	api_secret="03f13f18b10e2072";

var FlickrAPI= require('flickrnode').FlickrAPI;
var flickr= new FlickrAPI(api_key, api_secret);

server.configure(function() {
	server.use('/js', express.static(path.join(__dirname, 'js')));
	server.use('/css', express.static(path.join(__dirname, 'css')));
});

// Keep around as example of using regex match
server.get(/img\/(.+)/, function(req, res) {
	res.redirect(req.params[0]);
});

server.get("/authenticate", function(req, res) {
	res.set('Content-Type', 'application/json');
	flickr.getLoginUrl("delete", null, function(error, url, frob) {
		var r = {frob: frob, url: url};
		res.write(JSON.stringify(r));
		res.end();
	});
});

server.get("/gettoken/:frob", function(req, mainRes) {
	mainRes.set('Content-Type', 'application/json');
	var frob = req.params.frob, r;
	flickr.auth.getToken(frob, function(error, res) {
		if (!error) {
			r = {ok:"I just fucked Charlize Theron up the ass", token: res.token};
		} else {
			r = error;
		}
		mainRes.write(JSON.stringify(r));
		mainRes.end();
	});
});

server.all("*", function(req, res) {
	res.sendfile(__dirname + '/index.html');
});

server.listen(8000);