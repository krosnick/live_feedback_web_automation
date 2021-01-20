var express = require('express');
const { BrowserWindow } = require('electron');
var router = express.Router();
const { v1: uuidv1 } = require('uuid');

const { updateExampleWindows } = require('./index');

// Update code for current file
router.put('/update/', function(req, res, next) {
    const updatedCode = req.body.updatedFileContents;
    //console.log("updatedCode", updatedCode);

    // Compare the file's current startingUrl vs what url
        // updatedCode now contains. If different, update windows.
    req.app.locals.filesCollection.find({
        fileID: req.app.locals.fileID
    }).toArray(function(error, docs){
        const existingStartingUrl = docs[0].startingUrl;
        const newStartingUrl = extractStartingUrl(updatedCode);
        
        // Somewhere need to check and see if the url is valid; or, just try
            // telling BrowserView to load it and see if it works or not
        if(existingStartingUrl !== newStartingUrl){
            // Tell app to create BrowserViews (if no startingUrl existed before)
                // or to update BrowserViews with new startingUrl
            //console.log("urls not equal, need to update BrowserViews");
            updateExampleWindows(req, newStartingUrl);
        }

        req.app.locals.filesCollection.updateOne(
            {
                fileID: req.app.locals.fileID
            }, // query
            { 
                $set: {
                    fileContents: updatedCode,
                    startingUrl: newStartingUrl,
                    lastModified: Date.now()
                }
            },
            function(error, result){
                
                
                res.end();
            }
        );
    });
});

router.post('/getCurrentFileCode/', function(req, res, next) {
    req.app.locals.filesCollection.find({
        fileID: req.app.locals.fileID
    }).toArray(function(error, docs){
        console.log("docs[0].fileContents", docs[0].fileContents);
        res.send(docs[0].fileContents);
    });
});

const extractStartingUrl = function(codeString){
    // Check and see if code contains "page.goto(", whitespace allowed between terms
    const regex = /(page)\s*\.\s*(goto)\s*\(/;
    const indexMatch = codeString.search(regex);
    console.log("indexMatch", indexMatch);
    if(indexMatch === -1){
        return null;
    }else{
        // Assuming no parentheses in url string
        const openingParen = codeString.indexOf("(", indexMatch);
        const closingParen = codeString.indexOf(")", openingParen);
        const startingUrlWithQuotes = codeString.substring(openingParen+1, closingParen).trim();
        
        // Assuming startingUrlWithQuotes is a string literal, and that quotes are first and last char
        const startingUrl = startingUrlWithQuotes.substring(1, startingUrlWithQuotes.length-1);
        return startingUrl;
    }
};

module.exports = {
    router,
    extractStartingUrl
};