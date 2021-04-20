const { ipcRenderer } = require('electron');
const rrwebSnapshot = require("rrweb-snapshot");
let snapshotLineToDOMSelectorData;
let lastRunSnapshotLineToDOMSelectorData;
let errorData;
let lastRunErrorData;
//let lineNumToComponentsList;
/*const snapshotWidth = 250;
const snapshotHeight = 125;*/
let snapshotWidth;
let snapshotHeight;
let snapshotWidthNumOnly;
let snapshotHeightNumOnly;
let editorBrowserViewID;
let lineNumToConsoleOutputList = {};

let lastMouseEnterTime = 0;
let currentlyExpanded = false;
let mouseLeaveTimeout;

$(function(){
    snapshotWidth = getComputedStyle(document.querySelector("body")).getPropertyValue("--snapshot-width");
    snapshotHeight = getComputedStyle(document.querySelector("body")).getPropertyValue("--snapshot-height");
    snapshotWidthNumOnly = parseInt(snapshotWidth.substring(0, snapshotWidth.length-2));
    snapshotHeightNumOnly = parseInt(snapshotHeight.substring(0, snapshotHeight.length-2));
    /*console.log("snapshotWidth", snapshotWidth);
    console.log("snapshotHeight", snapshotHeight);
    console.log("snapshotWidthNumOnly", snapshotWidthNumOnly);
    console.log("snapshotHeightNumOnly", snapshotHeightNumOnly);*/
    editorBrowserViewID = $("#editorBrowserViewID").attr("editorBrowserViewID");
    $("body").on("click", ".hideRun", function(e){
        // Hide/show appropriate header elements
        $(e.target).closest(".fullViewContents").hide();
        $(e.target).closest(".colHeader").find(".showRun").show();

        // Hide snapshots
        const winID = $(e.target).attr("winID");
        const itemIndex = $(e.target).attr("itemIndex");
        const clusterIndex = $(e.target).closest(".cluster").attr("clusterIndex");
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshot[winID="${winID}"][itemIndex="${itemIndex}"]`).css("visibility", "hidden");
        $(`.cluster[clusterIndex="${clusterIndex}"] .zoomButton[winID="${winID}"][itemIndex="${itemIndex}"]`).css("visibility", "hidden");
        $(`.cluster[clusterIndex="${clusterIndex}"] .outerSnapshotContainer[winID="${winID}"][itemIndex="${itemIndex}"]`).css("resize", "none");
        $(`.cluster[clusterIndex="${clusterIndex}"] .outerSnapshotContainer[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: "50px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshotContainer[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: "50px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .colHeader[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: "50px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .downArrow[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: "50px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .consoleOutput[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: "50px"
        }, 500);
    });

    $("body").on("click", ".showRun", function(e){
        // Hide/show appropriate header elements
        $(e.target).hide();
        $(e.target).closest(".colHeader").find(".fullViewContents").show();

        // Show snapshots
        const winID = $(e.target).attr("winID");
        const itemIndex = $(e.target).attr("itemIndex");
        const clusterIndex = $(e.target).closest(".cluster").attr("clusterIndex");
        $(`.cluster[clusterIndex="${clusterIndex}"] .outerSnapshotContainer[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: snapshotWidthNumOnly + "px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshotContainer[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: snapshotWidthNumOnly + "px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .colHeader[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: snapshotWidthNumOnly + "px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .consoleOutput[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: snapshotWidthNumOnly + "px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .downArrow[winID="${winID}"][itemIndex="${itemIndex}"]`).animate({
            width: snapshotWidthNumOnly + "px"
        }, 500);
        $(`.cluster[clusterIndex="${clusterIndex}"] .outerSnapshotContainer[winID="${winID}"][itemIndex="${itemIndex}"]`).css("resize", "both");
        $(`.cluster[clusterIndex="${clusterIndex}"] .zoomButton[winID="${winID}"][itemIndex="${itemIndex}"]`).css("visibility", "visible");
        $(`.cluster[clusterIndex="${clusterIndex}"] .snapshot[winID="${winID}"][itemIndex="${itemIndex}"]`).css("visibility", "visible");
    });

    $("body").on("click", ".zoomIn", function(e){
        // Find the iframe element that should be zoomed
        const iframeElement = $(e.target).closest(".moreOuterSnapshotContainer").find("iframe");
        // Adjust transform
        const currentTransformString = iframeElement.css("transform");
        const scaleNum = getScaleNum(currentTransformString);
        if(scaleNum !== null){
            const newScaleNum = scaleNum + 0.1;
            iframeElement.css("transform", `scale(${newScaleNum})`);
        }
    });

    $("body").on("click", ".zoomOut", function(e){
        // Find the iframe element that should be zoomed
        const iframeElement = $(e.target).closest(".moreOuterSnapshotContainer").find("iframe");
        // Adjust transform
        const currentTransformString = iframeElement.css("transform");
        const scaleNum = getScaleNum(currentTransformString);
        if(scaleNum !== null){
            const newScaleNum = Math.max(scaleNum - 0.1, 0);
            iframeElement.css("transform", `scale(${newScaleNum})`);
        }
    });

    $("body").on("click", "#lockLineNumberButton", function(e){
        $("#lockLineNumberButton").hide();
        $("#unLockLineNumberButton").show();
        $("body").addClass("lineLockedBackground");
    });
    $("body").on("click", "#unLockLineNumberButton", function(e){
        unlockLineNumber();
    });

    $("body").on("click", "#pinSnapshotsButton", function(e){
        $("#pinSnapshotsButton").hide();
        $("#unPinSnapshotsButton").show();
    });
    $("body").on("click", "#unPinSnapshotsButton", function(e){
        $("#unPinSnapshotsButton").hide();
        $("#pinSnapshotsButton").show();
    });

    $("body").mouseenter(function(){
        //console.log('mouseenter');
        clearTimeout(mouseLeaveTimeout);
        lastMouseEnterTime = Date.now();
        if(!currentlyExpanded){
            currentlyExpanded = true;
            // Make snapshots view expand; send message back to server
            $.ajax({
                method: "POST",
                url: "/expandSnapshotView"
            });
        }
    });
    $("body").mouseleave(function(){
        //console.log("mouseleave");
        //console.log('mouseleave', Date.now());
        // Only contract snapshots view if this is a "real" leave, i.e., that a mouseenter didn't just happen too
        if(Date.now() - lastMouseEnterTime > 50){
            clearTimeout(mouseLeaveTimeout);
            mouseLeaveTimeout = setTimeout(function(){
                //console.log("large time diff")
                // Only contract snapshots if snapshots view isn't pinned
                if($("#pinSnapshotsButton").is(":visible")){
                    /*// Make snapshots view contract (to just fit right side of window); send message to server
                    $.ajax({
                        method: "POST",
                        url: "/showSnapshotView"
                    });*/
                    // Only contract if cursor isn't within bounds of BrowserView,
                    // so need to check BrowserView bounds and cursor position on server
                    // Dev tools should be included in BrowserView dimensions so will solve our problem with
                    // region contracting when user leaves body and goes into dev tools

                    $.ajax({
                        method: "POST",
                        url: "/reduceSnapshotViewIfCursorLeft"
                    }).done(function(result) {
                        // TODO - Based on response, update currentlyExpanded appropriately
                        //console.log("result", result);
                        if(result.reduced){
                            currentlyExpanded = false;
                        }
                    });
                }
            }, 500);
        }else{
            //console.log("small time diff");
        }
    });

    $("body").on('keypress',function(e) {
        if(e.which == 13) {
            const inputValue = parseInt($("#lineNumInputField").val());
            //console.log("inputValue", inputValue);
            if(Number.isInteger(inputValue)){
                // Update snapshot line to this
                // Don't worry about selector on this line, just show snapshot
                // Only update if different line number
                if(inputValue !== parseInt($("#lineNumber").text().trim())){
                    // Only update if line number not locked
                    if($("#lockLineNumberButton").is(":visible")){
                        // Show for this line
                        showSnapshots(inputValue, null);
                    }
                }
                // Set input to empty
                $("#lineNumInputField").val("");
            }
        }
    });
});

ipcRenderer.on("unpin", function(event){
    $("#unPinSnapshotsButton").hide();
    $("#pinSnapshotsButton").show();
});

ipcRenderer.on("addConsoleOutput", function(event, lineNumber, text){
    //console.log("addConsoleOutput");
    lineNumToConsoleOutputList[lineNumber] = lineNumToConsoleOutputList[lineNumber] || [];
    lineNumToConsoleOutputList[lineNumber].push(text);
});

ipcRenderer.on("newSnapshots", function(event, snapshotsData, errData){
    /*console.log("newSnapshots");
    console.log("snapshotsData", snapshotsData);
    console.log("componentsData", componentsData);*/
    lastRunSnapshotLineToDOMSelectorData = snapshotLineToDOMSelectorData;
    lastRunErrorData = errorData;
    snapshotLineToDOMSelectorData = snapshotsData;
    errorData = errData;
    //lineNumToComponentsList = componentsData;

    // Clear old snapshots
    $(".tooltip").remove();
});

ipcRenderer.on("unlockAndShowLineNumber", function(event, lineNumber, selector){
    // Make sure line number is unlocked, and show specified line number
    unlockLineNumber();

    // Show for this line
    showSnapshots(lineNumber, selector);
});

ipcRenderer.on("showLineNumber", function(event, lineNumber, selector){
    // Only update if different line number
    if(lineNumber !== parseInt($("#lineNumber").text().trim())){
        // Only update if line number not locked
        if($("#lockLineNumberButton").is(":visible")){
            // Show for this line
            showSnapshots(lineNumber, selector);
        }
    }else{
        // Still need to update selector highlighting
        updateCurrenSelectorHighlightingInIframes(selector)
    }
});

ipcRenderer.on("forceShowLineNumber", function(event, lineNumber, selector){
    // Make sure line number is unlocked, and show specified line number
    unlockLineNumber();

    // Show for this line
    showSnapshots(lineNumber, selector);
});

ipcRenderer.on("unlockLineNumber", function(event, lineNumber){
    // Make sure line number is unlocked, and show specified line number
    unlockLineNumber();
});

ipcRenderer.on("deleteAllSnapshotsForLine", function(event, lineNumberStr){
    delete snapshotLineToDOMSelectorData[lineNumberStr];
});

ipcRenderer.on("deleteAfterDomStringForLine", function(event, lineNumberStr){
    const lineObj = snapshotLineToDOMSelectorData[lineNumberStr];
    for(data of Object.values(lineObj)){
        for(item of data.after){
            delete item["afterDomString"];
        }
    }
});
ipcRenderer.on("clearAllSnapshots", function(event){
    snapshotLineToDOMSelectorData = undefined;
    lastRunSnapshotLineToDOMSelectorData = undefined;
    errorData = undefined;
    lastRunErrorData = undefined;
    lineNumToConsoleOutputList = {};
    //lineNumToComponentsList = undefined;

    // Removing element that contains iframes
    $(".tooltip").remove();

    // Make sure line number is unlocked, and show specified line number
    unlockLineNumber();
});

ipcRenderer.on("scriptStartedRunning", function(event){
    lineNumToConsoleOutputList = {};
});

ipcRenderer.on("getSelectorNumResults", function(event, lineNumber, selectorDataItem){
    const relevantClusterElement = $(`.tooltip[lineNumber="${lineNumber}"] .cluster[runInfo="currentRun"]`);
    const selectorNumResultsObjList = [];
    relevantClusterElement.find("iframe").each(function( index, element ) {
        const winID = $(element).attr("winID");
        const itemIndex = $(element).attr("itemIndex");
        const selectorNumResults = element.contentWindow.document.querySelectorAll(selectorDataItem.selectorString).length;
        selectorNumResultsObjList.push({
            winID,
            itemIndex,
            selectorNumResults
        });
    });
    ipcRenderer.sendTo(parseInt(editorBrowserViewID), "selectorNumResults", lineNumber, selectorNumResultsObjList, selectorDataItem);
});

function unlockLineNumber(){
    $("#unLockLineNumberButton").hide();
    $("#lockLineNumberButton").show();
    $("body").removeClass("lineLockedBackground");
}

// Show snapshots for this line (show if they're rendered already, or create if not)
function showSnapshots(lineNumber, selector){
    // Hide 'no snapshots' text first
    $("#noSnapshots").hide();
    $("#lineNumber").text(lineNumber);
    // Hide all snapshots
    $(".tooltip").hide();
    const snapshotsForThisLine = $(`.tooltip[lineNumber="${lineNumber}"] iframe`);
    if(snapshotsForThisLine.length > 0){
        // Exist already
        // Check that all iframes have width and height > 0
        let widthHeightAllNonZero = true;
        for(let i = 0; i < snapshotsForThisLine.length; i++){
            const thisSnapshot = $(snapshotsForThisLine[i]);
            /*console.log("thisSnapshot.width()", thisSnapshot.width());
            console.log("thisSnapshot.height()", thisSnapshot.height());*/
            if(thisSnapshot.width() === 0 || thisSnapshot.height() === 0){
                widthHeightAllNonZero = false;
            }
        }
        //("widthHeightAllNonZero", widthHeightAllNonZero);
        if(widthHeightAllNonZero){
            // Flash animation in snapshots view to grab user's attention
            $("#elementForFlashing").animate({
                opacity: 0.5
            }, 500).animate({
                opacity: 0
            }, 500);
            // All iframes have non-zero width and height - show them
            $(`.tooltip[lineNumber="${lineNumber}"]`).show();

            updateCurrenSelectorHighlightingInIframes(selector);
        }else{
            // At least one iframe has width or height of zero; re-render all
            //console.log("Have to re-render all iframes for this line");
            createSnapshots(lineNumber, selector);
        }
    }else{
        // Don't exist yet - create them
        createSnapshots(lineNumber, selector);
    }
}

function getScaleNum(transformString){
    if(transformString.indexOf("scale") >= 0){
        const openParenIndex = transformString.indexOf("(");
        const closeParenIndex = transformString.indexOf(")");
        const num = transformString.substring(openParenIndex+1, closeParenIndex);
        return parseFloat(num);
    }else if(transformString.indexOf("matrix") >= 0){
        const openParenIndex = transformString.indexOf("(");
        const firstCommaIndex = transformString.indexOf(",");
        const num = transformString.substring(openParenIndex+1, firstCommaIndex);
        return parseFloat(num);
    }else{
        return null;
    }
}

function createSnapshots(lineNumber, currentSelector){
    // If there's a snapshot for this line
    if((snapshotLineToDOMSelectorData && snapshotLineToDOMSelectorData[lineNumber]) || (lastRunSnapshotLineToDOMSelectorData && lastRunSnapshotLineToDOMSelectorData[lineNumber])){
        // Flash animation in snapshots view to grab user's attention
        $("#elementForFlashing").animate({
            opacity: 0.5,
        }, 500).animate({
            opacity: 0
        }, 500);

        const newElement = $(`
            <div class="tooltip" role="tooltip" data-show="" lineNumber="${lineNumber}">
                <div class="labels">
                    <div class="beforeLabel beforeAfterLabel">Before</div>
                    <div class="consoleLabel beforeAfterLabel">Console</div>
                    <div class="afterLabel beforeAfterLabel">After</div>
                </div>
                <div class="snapshots">
                </div>
            </div>
        `).appendTo("#container");

        if(snapshotLineToDOMSelectorData && snapshotLineToDOMSelectorData[lineNumber]){
            let cluster = Object.keys(snapshotLineToDOMSelectorData[lineNumber]);
            const firstWinID = cluster[0];
            const beforeObj = snapshotLineToDOMSelectorData[lineNumber][firstWinID]['before'];
            let selector;
            if(beforeObj && beforeObj[0] && beforeObj[0].selectorData){
                selector = beforeObj[0].selectorData.selectorString;
            }else{
                selector = null;
            }
            createCluster(cluster, "Current run", newElement, snapshotLineToDOMSelectorData, lineNumber, errorData, selector, currentSelector);
            /*let clusterList = [];
            const winIDsForThisLine = Object.keys(snapshotLineToDOMSelectorData[lineNumber]);
            if(lineNumToComponentsList && lineNumToComponentsList[lineNumber]){
                const connectedComponents = Object.values(lineNumToComponentsList[lineNumber]);

                // Create actual clusters

                const winIDsWithoutAfterSnapshot = [];
                const winIDsNotInConnectedComponents = [];

                for(const winID of winIDsForThisLine){
                    let winIDFound = false;
                    const winIDStr = winID + "";
                    for(const component of connectedComponents){
                        if(component.includes(winIDStr)){
                            winIDFound = true;
                        }
                    }
                    if(!winIDFound){
                        winIDsNotInConnectedComponents.push(winIDStr);
                    }

                    if(!snapshotLineToDOMSelectorData[lineNumber][winID].afterDomString){
                        winIDsWithoutAfterSnapshot.push(winIDStr);
                    }
                }

                // Start off using connectedComponents
                if(connectedComponents.length > 0){
                    clusterList = clusterList.concat(connectedComponents);
                }

                // Cluster winIDsWithoutAfterSnapshot together as their own cluster
                if(winIDsWithoutAfterSnapshot.length > 0){
                    clusterList.push(winIDsWithoutAfterSnapshot);
                }

                // For winIDsNotInConnectedComponents that are not in winIDsWithoutAfterSnapshot, keep each one separate
                for(const winIDStr of winIDsNotInConnectedComponents){
                    if(!winIDsWithoutAfterSnapshot.includes(winIDStr)){
                        // For some reason this winID wasn't included in a cluster, but it does have an afterSnapshot
                        // Let's just keep it as a separate cluster
                        clusterList.push([winIDStr]);
                    }
                }
            }else{
                // No clusters were identified on the server. Likely means that no winIDs on
                    // this line had afterSnapshot.
                // So let's just cluster all of the winIDs together
                const cluster = [];
                for(const winID of winIDsForThisLine){
                    const winIDStr = winID + "";
                    cluster.push(winIDStr);
                }
                clusterList.push(cluster);
            }

            //console.log(`clusterList for lineNumber ${lineNumber}`, clusterList);

            // Let's user clusterList now for grouping snapshots visually
            for(let index = 0; index < clusterList.length; index++){
                const cluster = clusterList[index];
                // cluster is of the form ["1", "2", "4"] (where "1" is a winID, etc)
                const firstWinID = cluster[0];
                const selectorData = snapshotLineToDOMSelectorData[lineNumber][firstWinID].selectorData;
                let selector;
                if(selectorData){
                    selector = selectorData.selectorString;
                }else{
                    selector = null;
                }
                createCluster(cluster, index, newElement, snapshotLineToDOMSelectorData, lineNumber, errorData, selector);
            }*/
        }

        // Create a cluster for last run (start with all winIDs minimized)
        // (Maybe even have the cluster itself minimized?)
        if(lastRunSnapshotLineToDOMSelectorData && lastRunSnapshotLineToDOMSelectorData[lineNumber]){
            let cluster = Object.keys(lastRunSnapshotLineToDOMSelectorData[lineNumber]);
            const firstWinID = cluster[0];
            const beforeObj = lastRunSnapshotLineToDOMSelectorData[lineNumber][firstWinID]['before'];
            let selector;
            if(beforeObj && beforeObj[0] && beforeObj[0].selectorData){
                selector = beforeObj[0].selectorData.selectorString;
            }else{
                selector = null;
            }
            createCluster(cluster, "Last run", newElement, lastRunSnapshotLineToDOMSelectorData, lineNumber, lastRunErrorData, selector, currentSelector);
        }
    }else{
        // Show "No snapshots" text
        $("#noSnapshots").show();
    }
}

function createCluster(cluster, indexOrName, newElement, snapshotObj, lineNumber, errorObj, selector, currentSelector){
    newElement.find(".snapshots").append(`<div class="clusterLabel">Label: ${indexOrName}</div>`);
    /*const clusterElement = $(`
        <div class="cluster" clusterIndex="${indexOrName}">
        </div>
    `);*/
    let clusterElement;
    if(indexOrName === "Last run"){
        clusterElement = $(`
            <div class="cluster" clusterIndex="${indexOrName}" runInfo="lastRun">
            </div>
        `);
    }else{
        clusterElement = $(`
            <div class="cluster" clusterIndex="${indexOrName}" runInfo="currentRun">
            </div>
        `);
    }
    newElement.find(".snapshots").append(clusterElement);

    // Now for each winID in this cluster, create an html string and append to clusterElement
    //for(let winIDIndex = 0; winIDIndex < cluster.length; winIDIndex++){
        //const winIDStr = cluster[winIDIndex];
    const winIDStr = cluster[0]; // For now just showing first winID
    const winID = parseInt(winIDStr);

    const lineObj = snapshotObj[lineNumber][winID];
    //console.log(`Line number ${lineNumber}`, lineObj);
    const lineObjBeforeList = lineObj['before'];
    const lineObjAfterList = lineObj['after'];
    // lineObjBeforeList and lineObjAfterList should be same length
    for(let itemIndex = 0; itemIndex < lineObjAfterList.length; itemIndex++){
        const beforeItemSnapshotObj = lineObjBeforeList[itemIndex];
        const afterItemSnapshotObj = lineObjAfterList[itemIndex];
        const beforeSnapshot = beforeItemSnapshotObj.beforeDomString;
        const afterSnapshot = afterItemSnapshotObj.afterDomString;
        const parametersString = JSON.stringify(afterItemSnapshotObj.parametersString);
        let errorString = "";
        const errorInfoForWin = errorObj[winID];
        if(errorInfoForWin){
            if(errorInfoForWin.errorLineNumber === lineNumber){
                // Check if lineObj.parametersString key/value are in errorInfoForWin.parameterValueSet
                const [key, value] = Object.entries(afterItemSnapshotObj.parametersString)[0];
                if(errorInfoForWin.parameterValueSet[key] && errorInfoForWin.parameterValueSet[key] === value){
                    // Show this error for this snapshot
                    errorString = errorInfoForWin.errorMessage;
                }
            }
        }

        let iterationString = "";
        if(lineObjAfterList.length === 1){
            // Don't show anything; just ran once, not inside a loop
        }else{
            iterationString = `Iteration ${itemIndex}`;
        }

        let consoleOutput = "";
        if(lineNumToConsoleOutputList[lineNumber]){
            consoleOutput = lineNumToConsoleOutputList[lineNumber][itemIndex];
        }

        // If last run, minimize all snapshots. Otherwise, show snapshots if it's the first winID or there's an error; otherwise, hide.
        //if((indexOrName !== "Last run") && (winIDIndex === 0 || errorString)){
        if((indexOrName !== "Last run")){
            clusterElement.append(`
                <div class="colHeader" winID='${winID}' itemIndex='${itemIndex}'>
                    <span class="fullViewContents">
                        <span class="runInfo" winID='${winID}' itemIndex='${itemIndex}'>
                            <!--${parametersString}-->
                            ${iterationString}
                            <span class="errorText">${errorString}</span>
                        </span>
                        <button class="hideRun hideShowRun clickableButton" winID='${winID}' itemIndex='${itemIndex}'>Hide</button>
                    </span>
                    <button class="showRun hideShowRun clickableButton" winID='${winID}' itemIndex='${itemIndex}'>Show</button>
                </div>
                <div class="moreOuterSnapshotContainer" winID='${winID}' itemIndex='${itemIndex}'>
                    <button winID='${winID}' itemIndex='${itemIndex}' title="Zoom in" class="zoomButton zoomIn clickableButton">+</button>
                    <button winID='${winID}' itemIndex='${itemIndex}' title="Zoom out" class="zoomButton zoomOut clickableButton">-</button>
                    <div class="outerSnapshotContainer" winID='${winID}' itemIndex='${itemIndex}'>
                        <div class="snapshotContainer" winID='${winID}' itemIndex='${itemIndex}'>
                            <iframe winID='${winID}' itemIndex='${itemIndex}' class='snapshot beforeSnapshot'></iframe>
                        </div>
                    </div>
                </div>
                <div class="downArrow" winID='${winID}' itemIndex='${itemIndex}'>&#8595;</div>
                <div class="consoleOutput" winID='${winID}' itemIndex='${itemIndex}'>${consoleOutput}</div>
                <div class="moreOuterSnapshotContainer" winID='${winID}' itemIndex='${itemIndex}'>
                    <button winID='${winID}' itemIndex='${itemIndex}' title="Zoom in" class="zoomButton zoomIn clickableButton">+</button>
                    <button winID='${winID}' itemIndex='${itemIndex}' title="Zoom out" class="zoomButton zoomOut clickableButton">-</button>
                    <div class="outerSnapshotContainer" winID='${winID}' itemIndex='${itemIndex}'>
                        <div class="snapshotContainer" winID='${winID}' itemIndex='${itemIndex}'>
                            <iframe winID='${winID}' itemIndex='${itemIndex}' class='snapshot afterSnapshot'></iframe>
                        </div>
                    </div>
                </div>
            `);
        }else{
            clusterElement.append(`
                <div class="colHeader" winID='${winID}' itemIndex='${itemIndex}' style="width: 50px;">
                    <span class="fullViewContents" style="display: none;">
                        <span class="runInfo" winID='${winID}' itemIndex='${itemIndex}'>
                            <!--${parametersString}-->
                            ${iterationString}
                        </span>
                        <button class="hideRun hideShowRun clickableButton" winID='${winID}' itemIndex='${itemIndex}'>Hide</button>
                    </span>
                    <button class="showRun hideShowRun clickableButton" winID='${winID}' itemIndex='${itemIndex}' style="display: block;">Show</button>
                </div>
                <div class="moreOuterSnapshotContainer" winID='${winID}' itemIndex='${itemIndex}'>
                    <button winID='${winID}' itemIndex='${itemIndex}' title="Zoom in" class="zoomButton zoomIn clickableButton" style="visibility: hidden;">+</button>
                    <button winID='${winID}' itemIndex='${itemIndex}' title="Zoom out" class="zoomButton zoomOut clickableButton" style="visibility: hidden;">-</button>
                    <div class="outerSnapshotContainer" winID='${winID}' itemIndex='${itemIndex}' style="width: 50px; resize: none;">
                        <div class="snapshotContainer" winID='${winID}' itemIndex='${itemIndex}' style="width: 50px;">
                            <iframe winID='${winID}' itemIndex='${itemIndex}' class='snapshot beforeSnapshot' style="visibility: hidden;"></iframe>
                        </div>
                    </div>
                </div>
                <div class="downArrow" winID='${winID}' itemIndex='${itemIndex}' style="width: 50px;">&#8595;</div>
                <div class="consoleOutput" winID='${winID}' itemIndex='${itemIndex}'>${consoleOutput}</div>
                <div class="moreOuterSnapshotContainer" winID='${winID}' itemIndex='${itemIndex}'>
                    <button winID='${winID}' itemIndex='${itemIndex}' title="Zoom in" class="zoomButton zoomIn clickableButton" style="visibility: hidden;">+</button>
                    <button winID='${winID}' itemIndex='${itemIndex}' title="Zoom out" class="zoomButton zoomOut clickableButton" style="visibility: hidden;">-</button>
                    <div class="outerSnapshotContainer" winID='${winID}' itemIndex='${itemIndex}' style="width: 50px; resize: none;">
                        <div class="snapshotContainer" winID='${winID}' itemIndex='${itemIndex}' style="width: 50px;">
                            <iframe winID='${winID}' itemIndex='${itemIndex}' class='snapshot afterSnapshot' style="visibility: hidden;"></iframe>
                        </div>
                    </div>
                </div>
            `);
        }
        
        if(beforeSnapshot && beforeSnapshot.childNodes.length >= 2){
            //console.log("beforeSnapshot", beforeSnapshot);
            const iframeElementBefore = clusterElement.find(`[winID='${winID}'][itemIndex='${itemIndex}'].beforeSnapshot`)[0];
            const iframeContentDocumentBefore = iframeElementBefore.contentDocument;
            rrwebSnapshot["rebuild"](beforeSnapshot, iframeContentDocumentBefore);

            scaleIframe(iframeElementBefore, beforeItemSnapshotObj, `left top`, selector, currentSelector);
        }

        if(afterSnapshot && afterSnapshot.childNodes.length >= 2){
            //console.log("afterSnapshot", afterSnapshot);
            const iframeElementAfter = clusterElement.find(`[winID='${winID}'][itemIndex='${itemIndex}'].afterSnapshot`)[0];
            const iframeContentDocumentAfter = iframeElementAfter.contentDocument;
            rrwebSnapshot["rebuild"](afterSnapshot, iframeContentDocumentAfter);

            scaleIframe(iframeElementAfter, afterItemSnapshotObj, `left top`, selector, currentSelector);
        }
    //}
    }
}

function scaleIframe(iframeElement, lineObj, transformOriginString, selector, currentSelector){
    if(iframeElement.contentWindow){
        const iframeDocument = iframeElement.contentWindow.document;
        let selectorString = "";
        let currentSelectorString = "";
        if(selector){
            if(iframeDocument.querySelector(selector)){
                selectorString = selector;
            }
        }
        if(currentSelector){
            if(iframeDocument.querySelector(currentSelector)){
                currentSelectorString = currentSelector;
            }
        }
        addCursorAndBorder(iframeElement, selectorString, currentSelectorString);
        // if(selector){
        //     //const selector = lineObj.selectorData.selectorString;
        //     const selectorElement = iframeDocument.querySelector(selector);
        //     if(selectorElement){
        //         addCursorAndBorder(iframeElement, selector, currentSelector);
        //     }
        //     // Zoom to selector element if it is present in DOM
        //     if(selectorElement){
        //         scaleToElement(selectorElement, iframeElement, iframeDocument, transformOriginString);
        //         //addCursorAndBorder(iframeElement, lineObj.selectorData.method, lineObj.selectorData.selectorString);
        //         addCursorAndBorder(iframeElement, currentSelector);
        //         return;
        //     }else{
        //         // TODO - Check if this is a keyboard command and if the prior command had a selector it was operating on

        //     }
        // }
        // Otherwise, scale to page width
        scaleToPageWidth(iframeElement, iframeDocument, transformOriginString);
    }
}

function scaleToElement(selectorElement, iframeElement, iframeDocument, transformOriginString){
    const currentElementWidth = selectorElement.getBoundingClientRect().width;
    const currentElementHeight = selectorElement.getBoundingClientRect().height;

    /*const paddingTotalHoriz = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-left')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-right'));
    const tooltipWidthWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().width - paddingTotalHoriz;
    const allowedSnapshotWidth = tooltipWidthWithoutPadding/2;*/
    
    /*const paddingTotalVert = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-top')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-bottom'));
    const tooltipHeightWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().height - paddingTotalVert;
    const allowedSnapshotHeight = tooltipHeightWithoutPadding;*/
    
    /*const transformOption1 = allowedSnapshotWidth / (3 * currentElementWidth); // want element to take up at most half of viewport width
    const transformOption2 = allowedSnapshotHeight / (3 * currentElementHeight); // want element to take up at most half of viewport height*/
    const transformOption1 = snapshotWidthNumOnly / (3 * currentElementWidth); // want element to take up at most 1/3 of viewport width
    const transformOption2 = snapshotHeightNumOnly / (3 * currentElementHeight); // want element to take up at most 1/3 of viewport height

    const chosenTransformScale = Math.min(transformOption1, transformOption2);

    /*const newSnapshotWidth = allowedSnapshotWidth / chosenTransformScale;
    const newSnapshotHeight = allowedSnapshotHeight / chosenTransformScale;*/
    const newSnapshotWidth = snapshotWidthNumOnly / chosenTransformScale;
    const newSnapshotHeight = snapshotHeightNumOnly / chosenTransformScale;

    $(iframeElement).css('width', `${newSnapshotWidth}px`);
    $(iframeElement).css('height', `${newSnapshotHeight}px`);
    iframeElement.style.transform = `scale(${chosenTransformScale})`;
    iframeElement.style.transformOrigin = transformOriginString;

    // Want to center it
    const scrollLeftAmount = selectorElement.getBoundingClientRect().x - newSnapshotWidth/3;
    const scrollTopAmount = selectorElement.getBoundingClientRect().y - newSnapshotHeight/3;

    iframeDocument.querySelector('html').scrollLeft = scrollLeftAmount;
    iframeDocument.querySelector('html').scrollTop = scrollTopAmount;
}

//function addCursorAndBorder(iframeElement, methodType, selector){
function addCursorAndBorder(iframeElement, selector, currentSelector){
    if(selector){
        const iframeDocBody = iframeElement.contentWindow.document.body;
        //console.log("iframeDocBody", iframeDocBody);
        //const element = iframeDocBody.querySelector(targetSelector);
        const elements = iframeDocBody.querySelectorAll(selector);
        //console.log("addCursorAndBorder elements", elements);
        //console.log("targetSelector", targetSelector);
        for(let element of elements){
            // Apply border only if this is an interactive widget,
                // e.g., <button>, <input>, <a>, <select>, <option>, <textarea>
            //if(element.tagName === "BUTTON" || element.tagName === "INPUT" || element.tagName === "A" || element.tagName === "SELECT" || element.tagName === "OPTION" || element.tagName === "TEXTAREA"){
                // If a radio button or checkbox, let's add the border and mouse icon to its parent since checkboxes and radio buttons are small, won't be able to see border/mouse icon
                if(element.tagName === "INPUT" && (element.type === "checkbox" || element.type === "radio")){
                    borderElement = element.parentNode;
                }else{
                    borderElement = element;
                }
                borderElement.style.border = "5px solid #08ae0d";
                borderElement.style.borderRadius = "10px";

                // Append mouse icon img if element is semantically "clickable",
                    // e.g., button, link, radio button, checkbox, but NOT textfield etc
                if(element.tagName === "BUTTON" || element.tagName === "A" || element.tagName === "SELECT" || element.tagName === "OPTION" || (element.tagName === "INPUT" && (element.type === "button" || element.type === "checkbox" || element.type === "color" || element.type === "file" || element.type === "radio" || element.type === "range" || element.type === "submit"))){
                    const imageElement = document.createElement('img');
                    borderElement.appendChild(imageElement);
                    
                    // Should change this to a local file
                    imageElement.src = "https://cdn2.iconfinder.com/data/icons/design-71/32/Design_design_cursor_pointer_arrow_mouse-512.png";
                    imageElement.width = 20;
                    imageElement.height = 20;
                    //imageElement.maxWidth = "50%";
                    //imageElement.maxHeight = "50%";
                    imageElement.style.position = "absolute";
                    imageElement.style.left = "calc(50% - 10px)";
                    imageElement.style.top = "calc(50% - 10px)";
                    //imageElement.style.left = "50%";
                    //imageElement.style.top = "50%";
                }
            //}
        }
    }
    /*iframeContentDocument.body.innerHTML = iframeContentDocument.body.innerHTML +
    `<style>
        .selectorReferenceInlineDecoration {
            background-color: lightsalmon;
        }
    </style>`;*/
    updateCurrenSelectorHighlightingInSingleIframe(currentSelector, iframeElement);
}

function updateCurrenSelectorHighlightingInSingleIframe(currentSelector, iframeElement){
    const iframeDocBody = iframeElement.contentWindow.document.body;

    // Remove currentSelectorHighlighting class from all elements that currently have it
    if(iframeDocBody){
        const currentlyHighlightedElements = iframeDocBody.querySelectorAll(".currentSelectorHighlighting");
        for(let element of currentlyHighlightedElements){
            element.classList.remove("currentSelectorHighlighting");
        }

        if(currentSelector){
            const iframeContentDocument = iframeElement.contentDocument;
            iframeContentDocument.body.innerHTML = iframeContentDocument.body.innerHTML +
            `<style>
                .currentSelectorHighlighting {
                    border: 5px solid blue !important;
                    border-radius: 10px !important;
                }
            </style>`;
            
            const elements = iframeDocBody.querySelectorAll(currentSelector);
            for(let element of elements){
                element.classList.add("currentSelectorHighlighting");
            }
        }
    }
}

function updateCurrenSelectorHighlightingInIframes(currentSelector){
    const iframes = $("iframe");
    for(let i = 0; i < iframes.length; i++){
        const iframeElement = iframes[i];
        updateCurrenSelectorHighlightingInSingleIframe(currentSelector, iframeElement);
    }
}

function scaleToPageWidth(iframeElement, iframeDocument, transformOriginString){
    const pageWidth = iframeDocument.querySelector("body").scrollWidth;

    /*const paddingTotalHoriz = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-left')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-right'));
    const tooltipWidthWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().width - paddingTotalHoriz;
    const allowedSnapshotWidth = tooltipWidthWithoutPadding/2;

    const paddingTotalVert = parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-top')) + parseFloat(window.getComputedStyle(document.querySelector(".tooltip"), null).getPropertyValue('padding-bottom'));
    const tooltipHeightWithoutPadding = document.querySelector(".tooltip").getBoundingClientRect().height - paddingTotalVert;
    const allowedSnapshotHeight = tooltipHeightWithoutPadding;*/

    /*const transformScale = allowedSnapshotWidth / pageWidth;
    const newSnapshotWidth = allowedSnapshotWidth / transformScale;
    const newSnapshotHeight = allowedSnapshotHeight / transformScale;*/
    
    const transformScale = snapshotWidthNumOnly / pageWidth;
    const newSnapshotWidth = snapshotWidthNumOnly / transformScale;
    const newSnapshotHeight = snapshotHeightNumOnly / transformScale;

    $(iframeElement).css('width', `${newSnapshotWidth}px`);
    $(iframeElement).css('height', `${newSnapshotHeight}px`);
    iframeElement.style.transform = `scale(${transformScale})`;
    iframeElement.style.transformOrigin = transformOriginString;
}