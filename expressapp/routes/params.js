var express = require('express');
const { BrowserWindow } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');

// Update params for current file
router.put('/update/', function(req, res, next) {
    const updatedParamCodeString = req.body.updatedParamCodeString;
    console.log("updatedParamCodeString", updatedParamCodeString);
    req.app.locals.filesCollection.updateOne(
        {
            fileID: req.app.locals.fileID
        }, // query
        { 
            $set: {
                paramCodeString: updatedParamCodeString,
                lastModified: Date.now()
            }
        },
        function(error, result){
            res.end();
        }
    );
});

router.post('/getCurrentParamCodeString/', function(req, res, next) {
    req.app.locals.filesCollection.find({
        fileID: req.app.locals.fileID
    }).toArray(function(error, docs){
        console.log("docs[0].paramCodeString", docs[0].paramCodeString);
        res.send(docs[0].paramCodeString);
    });
});

module.exports.router = router;
module.exports = {
    router
};