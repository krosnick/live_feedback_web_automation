var express = require('express');
const { BrowserWindow } = require('electron');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  /*req.app.locals.annotationsCollection.distinct("captureID", function(error, items){
    res.render('layouts/index', {
      "captureIDs": items,
      "sharedKeysDir": process.argv[2],
      "personalKeysDir": process.argv[3] // Render as divs using the template; client-side JS can then access them
    });
  });*/
  res.render('layouts/index');
});

module.exports.router = router;