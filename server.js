#!/usr/bin/env node

var path = require("path"),
	express = require('express'),
	server = express();

server.configure(function() {
	server.use('/js', express.static(path.join(__dirname, 'js')));
	server.use('/css', express.static(path.join(__dirname, 'css')));
	server.use(function(req, res) {
		res.sendfile(__dirname + '/index.html');
	});
});

server.listen(8000);