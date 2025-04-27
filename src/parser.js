function parseMapFile(mapContent) {
    const entities = {};
    const connections = [];

    const entityRegex = /([BMIFCDEGJ])(\d{3})([^BMIFCDEGJ\n]*)/g;
    let match;

    while ((match = entityRegex.exec(mapContent)) !== null) {
        const entityType = match[1];
        const entityId = match[2];
        const entityKey = entityType + entityId;
        const dataStr = match[3];
        const position = match.index;

        const isPotentialConnection =
            position + 4 < mapContent.length &&
            /[BMIFCDEGJ]/.test(mapContent[position + 4]) &&
            /\d/.test(mapContent[position + 5]) &&
            /\d/.test(mapContent[position + 6]) &&
            /\d/.test(mapContent[position + 7]);

        if (entities[entityKey] || isPotentialConnection) continue;

        const properties = extractProperties(entityType, dataStr);

        entities[entityKey] = {
            id: entityKey,
            name: entityKey,
            type: entityType,
            numeric_id: parseInt(entityId, 10),
            position: properties.position,
            properties: properties.other
        };
    }

    const connectionRegex = /([BMIFCDEGJ]\d{3})([BMIFCDEGJ]\d{3})/g;

    while ((match = connectionRegex.exec(mapContent)) !== null) {
        const sourceEntity = match[1];
        const targetEntity = match[2];

        if (!entities[sourceEntity]) {
            entities[sourceEntity] = {
                id: sourceEntity,
                name: sourceEntity,
                type: sourceEntity.charAt(0),
                numeric_id: parseInt(sourceEntity.substring(1), 10),
                position: { x: 0, y: 0, z: 0 },
                properties: {}
            };
        }

        if (!entities[targetEntity]) {
            entities[targetEntity] = {
                id: targetEntity,
                name: targetEntity,
                type: targetEntity.charAt(0),
                numeric_id: parseInt(targetEntity.substring(1), 10),
                position: { x: 0, y: 0, z: 0 },
                properties: {}
            };
        }

        const connEnd = mapContent.indexOf('\n', match.index + match[0].length);
        const connData = mapContent.substring(
            match.index + match[0].length,
            connEnd !== -1 ? connEnd : undefined
        );

        const connProperties = extractProperties(null, connData);

        connections.push({
            id: `${sourceEntity}->${targetEntity}`,
            source: sourceEntity,
            target: targetEntity,
            properties: connProperties.other
        });
    }

    const connectionCounts = {};

    Object.keys(entities).forEach(entityId => {
        connectionCounts[entityId] = { incoming: 0, outgoing: 0 };
    });

    connections.forEach(conn => {
        connectionCounts[conn.source].outgoing = (connectionCounts[conn.source].outgoing || 0) + 1;
        connectionCounts[conn.target].incoming = (connectionCounts[conn.target].incoming || 0) + 1;
    });

    Object.entries(connectionCounts).forEach(([entityId, counts]) => {
        if (entities[entityId]) {
            entities[entityId].connections = counts;
        }
    });

    Object.values(entities).forEach(entity => {
        assignEntityTypeInfo(entity);
    });

    const entitiesArray = Object.values(entities);

    return {
        meta: {
            entityCount: entitiesArray.length,
            connectionCount: connections.length,
            entityTypes: countEntityTypes(entitiesArray),
            mapType: determineMapType(entitiesArray)
        },
        entities: entitiesArray,
        connections: connections
    };
}

function extractProperties(entityType, dataStr) {
    const position = { x: 0, y: 0, z: 0 };
    const other = {};

    const propRegex = /([?>=<])([^?>=<\n]{1,10})/g;
    let match;
    let coordCount = 0;

    while ((match = propRegex.exec(dataStr)) !== null) {
        const prefix = match[1];
        const valueStr = match[2];

        const value = estimateNumericValue(valueStr);

        if (entityType === 'D') {
            if (coordCount === 0) {
                position.x = value;
            } else if (coordCount === 1) {
                position.y = value;
            } else if (coordCount === 2) {
                position.z = value;
            } else {
                other[`prop_${prefix}_${coordCount}`] = value;
            }
        } else {
            if (coordCount === 0) {
                position.x = value;
            } else if (coordCount === 1) {
                position.y = value;
            } else if (coordCount === 2) {
                position.z = value;
            } else {
                other[`prop_${prefix}_${coordCount}`] = value;
            }
        }

        coordCount++;
    }

    return { position, other };
}

function estimateNumericValue(raw) {
    if (raw.length >= 4) {
        try {
            const buffer = new ArrayBuffer(4);
            const view = new DataView(buffer);

            for (let i = 0; i < Math.min(raw.length, 4); i++) {
                view.setUint8(i, raw.charCodeAt(i));
            }

            const value = view.getFloat32(0, true);

            if (!isNaN(value) && isFinite(value) && Math.abs(value) < 1000) {
                return parseFloat(value.toFixed(4));
            }
        } catch (e) {
            console.error("Failed to parse binary data:", e);
        }
    }

    let value = 0;
    for (let i = 0; i < Math.min(raw.length, 4); i++) {
        value += raw.charCodeAt(i) / 100;
    }
    return parseFloat(value.toFixed(4));
}

function assignEntityTypeInfo(entity) {
    const counts = entity.connections || { incoming: 0, outgoing: 0 };

    switch (entity.type) {
        case 'B':
            entity.description = 'Block/Building';
            if (counts.outgoing > 2 && counts.incoming === 0) {
                entity.subtype = 'Spawn Point';
            } else if (counts.incoming > 2 && counts.outgoing === 0) {
                entity.subtype = 'Exit Point';
            } else if (counts.incoming > 0 && counts.outgoing > 0) {
                entity.subtype = 'Junction';
            } else {
                entity.subtype = 'Block';
            }
            break;

        case 'M':
            entity.description = 'Mission/Marker';
            if (counts.incoming > 0 && counts.outgoing === 0) {
                entity.subtype = 'Goal';
            } else if (counts.outgoing > 0) {
                entity.subtype = 'Start Point';
            } else {
                entity.subtype = 'Checkpoint';
            }
            break;

        case 'I':
            entity.description = 'Item/Interaction';
            if (counts.incoming > 2) {
                entity.subtype = 'Major Item';
            } else if (counts.outgoing > 2) {
                entity.subtype = 'Item Dispenser';
            } else if (counts.incoming > 0 && counts.outgoing > 0) {
                entity.subtype = 'Interactive Item';
            } else {
                entity.subtype = 'Standard Item';
            }
            break;

        case 'F':
            entity.description = 'Function/Feature';
            if (counts.outgoing > 0 && counts.incoming === 0) {
                entity.subtype = 'Trigger';
            } else if (counts.incoming > 0 && counts.outgoing === 0) {
                entity.subtype = 'Action';
            } else if (counts.incoming > 0 && counts.outgoing > 0) {
                entity.subtype = 'Logic Gate';
            } else {
                entity.subtype = 'Game Function';
            }
            break;

        case 'C':
            entity.description = 'Character/NPC';
            if (entity.numeric_id >= 100) {
                entity.subtype = 'Major Character';
            } else if (counts.incoming > 2) {
                entity.subtype = 'Interactive NPC';
            } else if (counts.outgoing > 2) {
                entity.subtype = 'Character Spawner';
            } else {
                entity.subtype = 'Basic NPC';
            }
            break;

        case 'D':
            entity.description = 'Dialog/Data';
            if (entity.numeric_id === 0) {
                entity.subtype = 'Dialog Root';
            } else if (counts.outgoing > 2) {
                entity.subtype = 'Dialog Branch';
            } else if (counts.incoming > 2) {
                entity.subtype = 'Dialog Endpoint';
            } else if (counts.incoming > 0 && counts.outgoing > 0) {
                entity.subtype = 'Dialog Node';
            } else {
                entity.subtype = 'Data Point';
            }
            break;

        case 'E':
            entity.description = 'Environment/Area';
            if (counts.outgoing > 2 && counts.incoming === 0) {
                entity.subtype = 'Starting Area';
            } else if (counts.incoming > 2 && counts.outgoing === 0) {
                entity.subtype = 'Goal Area';
            } else if (counts.incoming > 0 && counts.outgoing > 0) {
                entity.subtype = 'Transit Area';
            } else {
                entity.subtype = 'Generic Area';
            }
            break;

        case 'G':
            entity.description = 'Gameplay/Goal';
            if (entity.numeric_id < 10) {
                entity.subtype = 'Primary Goal';
            } else if (counts.incoming > counts.outgoing) {
                entity.subtype = 'Checkpoint';
            } else if (counts.outgoing > counts.incoming) {
                entity.subtype = 'Trigger Point';
            } else {
                entity.subtype = 'Objective Marker';
            }
            break;

        case 'J':
            entity.description = 'Junction/Journey';
            if (counts.outgoing > 2 && counts.incoming <= 1) {
                entity.subtype = 'Path Branch';
            } else if (counts.incoming > 2 && counts.outgoing <= 1) {
                entity.subtype = 'Path Merger';
            } else if (counts.incoming > 0 && counts.outgoing > 0) {
                entity.subtype = 'Transition Point';
            } else {
                entity.subtype = 'Waypoint';
            }
            break;

        default:
            entity.description = 'Unknown';
            entity.subtype = 'Unknown';
    }
}

function countEntityTypes(entities) {
    const counts = {};

    entities.forEach(entity => {
        const type = entity.type;
        counts[type] = (counts[type] || 0) + 1;
    });

    return counts;
}

function determineMapType(entities) {
    const typeCounts = countEntityTypes(entities);

    if (typeCounts['J'] && typeCounts['J'] > (entities.length * 0.6)) {
        return "Junction/Path Map";
    }

    if (typeCounts['J'] && typeCounts['M']) {
        return "Mission Path Map";
    }

    if (typeCounts['J'] && typeCounts['E']) {
        return "Area Navigation Map";
    }

    if (typeCounts['G'] && typeCounts['G'] > (entities.length * 0.6)) {
        return "Gameplay/Goal Map";
    }

    if (typeCounts['G'] && typeCounts['M']) {
        return "Mission Objective Map";
    }

    if (typeCounts['G'] && typeCounts['E']) {
        return "Area Objective Map";
    }

    if (typeCounts['E'] && typeCounts['E'] > (entities.length * 0.6)) {
        return "Environment/Area Map";
    }

    if (typeCounts['E'] && typeCounts['M']) {
        return "Environment Mission Map";
    }

    if (typeCounts['E'] && typeCounts['C']) {
        return "Character Environment Map";
    }

    if (typeCounts['D'] && typeCounts['D'] > (entities.length * 0.6)) {
        return "Dialog/Data Map";
    }

    if (typeCounts['C'] && typeCounts['C'] > (entities.length * 0.6)) {
        return "Character Map";
    }

    if (typeCounts['I'] && typeCounts['I'] > (entities.length * 0.6)) {
        return "Item/Interaction Map";
    }

    if (typeCounts['B'] && typeCounts['B'] > (entities.length * 0.6)) {
        return "Building/Structure Map";
    }

    if (typeCounts['M'] && typeCounts['M'] > (entities.length * 0.6)) {
        return "Mission/Objective Map";
    }

    if (typeCounts['F'] && typeCounts['F'] > (entities.length * 0.6)) {
        return "Function/Logic Map";
    }

    if (typeCounts['D'] && typeCounts['C']) {
        return "Character Dialog Map";
    }

    if (typeCounts['C'] && typeCounts['M']) {
        return "Character Mission Map";
    }

    if (typeCounts['I'] && typeCounts['F']) {
        return "Interactive Function Map";
    }

    if (typeCounts['B'] && typeCounts['M']) {
        return "Level Structure Map";
    }

    return "Mixed Entity Map";
}

function visualizeMap(mapData) {
    const mapSize = 40;
    const grid = Array(mapSize).fill().map(() => Array(mapSize).fill(' '));

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    mapData.entities.forEach(entity => {
        const x = entity.position.x;
        const y = entity.position.y;

        if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    });

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        const gridSize = Math.ceil(Math.sqrt(mapData.entities.length));
        let idx = 0;

        mapData.entities.forEach(entity => {
            const x = idx % gridSize;
            const y = Math.floor(idx / gridSize);

            entity.position = entity.position || {};
            entity.position.x = x;
            entity.position.y = y;
            entity.position.z = 0;

            idx++;
        });

        minX = 0; maxX = gridSize - 1;
        minY = 0; maxY = gridSize - 1;
    }

    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;

    mapData.entities.forEach(entity => {
        const x = entity.position.x;
        const y = entity.position.y;

        if (x !== undefined && y !== undefined && !isNaN(x) && !isNaN(y)) {
            const gridX = Math.floor(((x - minX) / rangeX) * (mapSize - 6)) + 3;
            const gridY = Math.floor(((y - minY) / rangeY) * (mapSize - 6)) + 3;

            if (gridX >= 0 && gridX < mapSize && gridY >= 0 && gridY < mapSize) {
                grid[gridY][gridX] = entity.type;

                if (gridX + 1 < mapSize) grid[gridY][gridX + 1] = entity.id.charAt(1);
                if (gridX + 2 < mapSize) grid[gridY][gridX + 2] = entity.id.charAt(2);
                if (gridX + 3 < mapSize) grid[gridY][gridX + 3] = entity.id.charAt(3);
            }
        }
    });

    mapData.connections.forEach(conn => {
        const source = mapData.entities.find(e => e.id === conn.source);
        const target = mapData.entities.find(e => e.id === conn.target);

        if (source && target &&
            source.position && target.position &&
            !isNaN(source.position.x) && !isNaN(source.position.y) &&
            !isNaN(target.position.x) && !isNaN(target.position.y)) {

            const sx = source.position.x;
            const sy = source.position.y;
            const tx = target.position.x;
            const ty = target.position.y;

            const gridSX = Math.floor(((sx - minX) / rangeX) * (mapSize - 6)) + 3;
            const gridSY = Math.floor(((sy - minY) / rangeY) * (mapSize - 6)) + 3;
            const gridTX = Math.floor(((tx - minX) / rangeX) * (mapSize - 6)) + 3;
            const gridTY = Math.floor(((ty - minY) / rangeY) * (mapSize - 6)) + 3;

            drawLine(grid, gridSX, gridSY, gridTX, gridTY);
        }
    });

    let output = "=== MAP VISUALIZATION ===\n";
    output += "+";
    for (let i = 0; i < mapSize; i++) output += "-";
    output += "+\n";

    grid.forEach(row => {
        output += "|" + row.join("") + "|\n";
    });

    output += "+";
    for (let i = 0; i < mapSize; i++) output += "-";
    output += "+\n\n";

    output += "=== MAP STATISTICS ===\n";
    output += `Map Type: ${mapData.meta.mapType}\n`;
    output += `Entities: ${mapData.meta.entityCount}, Connections: ${mapData.meta.connectionCount}\n`;
    output += `Entity Types: ${JSON.stringify(mapData.meta.entityTypes)}\n\n`;

    output += "=== ENTITY DETAILS ===\n";
    mapData.entities.slice(0, 15).forEach(entity => {
        output += `${entity.id}: ${entity.description || entity.type} - ${entity.subtype || 'Unknown'}\n`;
        output += `  Position: (${entity.position.x.toFixed(2)}, ${entity.position.y.toFixed(2)}, ${entity.position.z.toFixed(2)})\n`;

        if (entity.connections) {
            output += `  Connections: In=${entity.connections.incoming || 0}, Out=${entity.connections.outgoing || 0}\n`;
        }

        output += '\n';
    });

    output += "\nConnection Overview:\n";

    output += "Entity\tOutgoing Connections\tIncoming Connections\n";
    output += "------\t-------------------\t-------------------\n";

    mapData.entities.slice(0, 15).forEach(entity => {
        const outgoingConnections = mapData.connections
            .filter(conn => conn.source === entity.id)
            .map(conn => conn.target);

        const incomingConnections = mapData.connections
            .filter(conn => conn.target === entity.id)
            .map(conn => conn.source);

        output += `${entity.id}\t${outgoingConnections.join(', ') || 'None'}\t${incomingConnections.join(', ') || 'None'}\n`;
    });

    output += "\nDetailed Entity Information:\n";
    mapData.entities.slice(0, 15).forEach(entity => {
        output += `${entity.id}: ${entity.description || entity.type} - ${entity.subtype || 'Unknown'}\n`;
        output += `  Position: (${entity.position.x.toFixed(2)}, ${entity.position.y.toFixed(2)}, ${entity.position.z.toFixed(2)})\n`;

        if (entity.connections) {
            output += `  Connections: In=${entity.connections.incoming || 0}, Out=${entity.connections.outgoing || 0}\n`;

            const outConns = mapData.connections.filter(conn => conn.source === entity.id);
            if (outConns.length > 0) {
                output += `  Outgoing: ${outConns.map(c => c.target).join(', ')}\n`;
            }

            const inConns = mapData.connections.filter(conn => conn.target === entity.id);
            if (inConns.length > 0) {
                output += `  Incoming: ${inConns.map(c => c.source).join(', ')}\n`;
            }
        }

        output += '\n';
    });

    if (mapData.entities.length > 15) {
        output += `... and ${mapData.entities.length - 15} more entities\n`;
    }

    return output;
}

function drawLine(grid, x1, y1, x2, y2) {
    // Bresenham line algorithm
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    if (x1 < 0 || x1 >= grid[0].length || y1 < 0 || y1 >= grid.length ||
        x2 < 0 || x2 >= grid[0].length || y2 < 0 || y2 >= grid.length) {
        return;
    }

    while (true) {
        if (grid[y1][x1] === ' ' || grid[y1][x1] === '-' || grid[y1][x1] === '|' || grid[y1][x1] === '+') {
            if (dx > dy) grid[y1][x1] = '-';  // Horizontal
            else if (dy > dx) grid[y1][x1] = '|';  // Vertical
            else grid[y1][x1] = '+';  // Diagonal
        }

        if (x1 === x2 && y1 === y2) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x1 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y1 += sy;
        }

        if (x1 < 0 || x1 >= grid[0].length || y1 < 0 || y1 >= grid.length) break;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mapFileInput = document.getElementById('mapFileInput');
    const fileName = document.getElementById('fileName');
    const mapContentInput = document.getElementById('mapContentInput');
    const jsonOutput = document.getElementById('jsonOutput');
    const convertBtn = document.getElementById('convertBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const copyBtn = document.getElementById('copyBtn');
    const statusMessage = document.getElementById('statusMessage');
    const toggleVisualizeBtn = document.getElementById('toggleVisualizeBtn');
    const visualizationContainer = document.getElementById('visualizationContainer');
    const mapVisualization = document.getElementById('mapVisualization');
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const mapStats = document.getElementById('mapStats');
    const entityTable = document.getElementById('entityTable').querySelector('tbody');
    const entityCount = document.getElementById('entityCount');
    const connectionCount = document.getElementById('connectionCount');
    const entityTypeStats = document.getElementById('entityTypeStats');
    const connectionPatterns = document.getElementById('connectionPatterns');
    const connectionChart = document.getElementById('connectionChart');

    let parsedMapData = null;

    mapFileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            fileName.textContent = file.name;
            try {
                const reader = new FileReader();
                reader.onload = function (e) {
                    mapContentInput.value = e.target.result;
                };
                reader.readAsText(file);
            } catch (err) {
                showStatus(`Error reading file: ${err.message}`, false);
            }
        } else {
            fileName.textContent = '';
        }
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));

            tab.classList.add('active');

            tabContents.forEach(tc => tc.classList.add('hidden'));

            const tabId = tab.getAttribute('data-tab');
            document.getElementById(`${tabId}Tab`).classList.remove('hidden');
        });
    });

    convertBtn.addEventListener('click', () => {
        const mapContent = mapContentInput.value.trim();

        if (!mapContent) {
            showStatus('Please enter map file content or select a file', false);
            return;
        }

        try {
            parsedMapData = parseMapFile(mapContent);

            const jsonData = JSON.stringify(parsedMapData, null, 2);
            jsonOutput.value = jsonData;

            const visualization = visualizeMap(parsedMapData);
            mapVisualization.textContent = visualization;

            updateAnalysisTab(parsedMapData);

            updateEntitiesTab(parsedMapData);

            downloadBtn.disabled = false;

            showStatus(`Successfully converted map file. Found ${parsedMapData.meta.entityCount} entities and ${parsedMapData.meta.connectionCount} connections.`, true);

            if (visualizationContainer.classList.contains('hidden')) {
                toggleVisualizeBtn.click();
            }
        } catch (err) {
            console.log(err);
            showStatus(`Error parsing map file: ${err.message}`, false);
            jsonOutput.value = '';
            mapVisualization.textContent = '';
            downloadBtn.disabled = true;
        }
    });

    analyzeBtn.addEventListener('click', () => {
        const mapContent = mapContentInput.value.trim();

        if (!mapContent) {
            showStatus('Please enter map file content or select a file', false);
            return;
        }

        try {
            parsedMapData = parseMapFile(mapContent);

            const visualization = visualizeMap(parsedMapData);
            mapVisualization.textContent = visualization;

            updateAnalysisTab(parsedMapData);

            updateEntitiesTab(parsedMapData);

            document.querySelector('[data-tab="analysis"]').click();

            showStatus(`Successfully analyzed map file. Found ${parsedMapData.meta.entityCount} entities and ${parsedMapData.meta.connectionCount} connections.`, true);

            if (visualizationContainer.classList.contains('hidden')) {
                toggleVisualizeBtn.click();
            }
        } catch (err) {
            showStatus(`Error analyzing map file: ${err.message}`, false);
        }
    });

    function updateAnalysisTab(mapData) {
        entityCount.textContent = mapData.meta.entityCount;
        connectionCount.textContent = mapData.meta.connectionCount;

        mapStats.innerHTML = `
        <div class="map-type-badge">${mapData.meta.mapType}</div>
        <h3>Map Overview</h3>
        <p>This map contains ${mapData.meta.entityCount} entities and ${mapData.meta.connectionCount} connections between them.</p>
      `;

        const entityTypes = mapData.meta.entityTypes;
        let entityTypeHTML = '<div class="entity-stats">';

        Object.entries(entityTypes).forEach(([type, count]) => {
            const typeName = getEntityTypeName(type);
            entityTypeHTML += `
          <div class="entity-stat">
            <div class="entity-icon entity-${type}">${type}</div>
            <div class="stat-count">${count}</div>
            <div>${typeName}</div>
          </div>
        `;
        });

        entityTypeHTML += '</div>';
        entityTypeStats.innerHTML = entityTypeHTML;

        const patterns = {};
        mapData.connections.forEach(conn => {
            const sourceType = conn.source.charAt(0);
            const targetType = conn.target.charAt(0);
            const pattern = `${sourceType} → ${targetType}`;
            patterns[pattern] = (patterns[pattern] || 0) + 1;
        });

        let patternsHTML = '<table>';
        patternsHTML += '<tr><th>Pattern</th><th>Count</th><th>Description</th></tr>';

        Object.entries(patterns)
            .sort((a, b) => b[1] - a[1])
            .forEach(([pattern, count]) => {
                const [sourceType, targetType] = pattern.split(' → ');
                patternsHTML += `
            <tr>
              <td>
                <span class="entity-icon entity-${sourceType}">${sourceType}</span>
                →
                <span class="entity-icon entity-${targetType}">${targetType}</span>
              </td>
              <td>${count}</td>
              <td>${getConnectionDescription(sourceType, targetType)}</td>
            </tr>
          `;
            });

        patternsHTML += '</table>';
        connectionPatterns.innerHTML = patternsHTML;

        let connectionMatrixHTML = '<h3>Connection Matrix</h3>';
        connectionMatrixHTML += '<div style="overflow-x: auto;"><table class="connection-matrix">';

        connectionMatrixHTML += '<tr><th></th>';
        mapData.entities.forEach(entity => {
            connectionMatrixHTML += `<th>${entity.id}</th>`;
        });
        connectionMatrixHTML += '</tr>';

        mapData.entities.forEach(sourceEntity => {
            connectionMatrixHTML += `<tr><th>${sourceEntity.id}</th>`;

            mapData.entities.forEach(targetEntity => {
                const hasConnection = mapData.connections.some(
                    conn => conn.source === sourceEntity.id && conn.target === targetEntity.id
                );

                if (hasConnection) {
                    connectionMatrixHTML += '<td class="has-connection">✓</td>';
                } else {
                    connectionMatrixHTML += '<td>-</td>';
                }
            });

            connectionMatrixHTML += '</tr>';
        });

        connectionMatrixHTML += '</table></div>';

        connectionPatterns.insertAdjacentHTML('afterend', connectionMatrixHTML);

        const style = document.createElement('style');
        style.textContent = `
        .connection-matrix {
          font-size: 12px;
          border-collapse: collapse;
        }
        .connection-matrix th, .connection-matrix td {
          border: 1px solid #dee2e6;
          padding: 4px;
          text-align: center;
          min-width: 30px;
        }
        .connection-matrix th {
          background-color: #f8f9fa;
          position: sticky;
          top: 0;
        }
        .connection-matrix th:first-child {
          position: sticky;
          left: 0;
          z-index: 2;
        }
        .connection-matrix .has-connection {
          background-color: #d4edda;
          color: #155724;
        }
      `;
        document.head.appendChild(style);
    }

    function updateEntitiesTab(mapData) {
        entityTable.innerHTML = '';

        mapData.entities.forEach(entity => {
            const row = document.createElement('tr');

            const idCell = document.createElement('td');
            idCell.innerHTML = `<span class="entity-icon entity-${entity.type}">${entity.type}</span>${entity.id}`;
            row.appendChild(idCell);

            const typeCell = document.createElement('td');
            typeCell.textContent = entity.description || entity.type;
            row.appendChild(typeCell);

            const subtypeCell = document.createElement('td');
            subtypeCell.textContent = entity.subtype || 'Unknown';
            row.appendChild(subtypeCell);

            const positionCell = document.createElement('td');
            positionCell.textContent = `(${entity.position.x.toFixed(2)}, ${entity.position.y.toFixed(2)}, ${entity.position.z.toFixed(2)})`;
            row.appendChild(positionCell);

            const connectionsCell = document.createElement('td');
            connectionsCell.textContent = `In: ${entity.connections?.incoming || 0}, Out: ${entity.connections?.outgoing || 0}`;
            row.appendChild(connectionsCell);

            entityTable.appendChild(row);
        });
    }

    function getEntityTypeName(type) {
        switch (type) {
            case 'B': return 'Block/Building';
            case 'M': return 'Mission/Marker';
            case 'I': return 'Item/Interaction';
            case 'F': return 'Function/Feature';
            case 'C': return 'Character/NPC';
            case 'D': return 'Dialog/Data';
            case 'E': return 'Environment/Area';
            case 'G': return 'Gameplay/Goal';
            case 'J': return 'Junction/Journey';
            default: return 'Unknown';
        }
    }

    function getConnectionDescription(sourceType, targetType) {
        const sourceDesc = getEntityTypeName(sourceType);
        const targetDesc = getEntityTypeName(targetType);

        const descriptions = {
            'B→B': 'Building connects to building',
            'B→M': 'Building connects to mission marker',
            'M→B': 'Mission marker connects to building',
            'I→I': 'Item connects to item',
            'I→F': 'Item triggers function',
            'F→I': 'Function controls item',
            'C→C': 'Character interacts with character',
            'C→M': 'Character has mission objective',
            'M→C': 'Mission involves character',
            'D→D': 'Dialog choice leads to dialog',
            'D→M': 'Dialog leads to mission',
            'C→D': 'Character initiates dialog',
            'D→C': 'Dialog references character',
            'E→E': 'Area connects to area',
            'E→M': 'Area contains mission marker',
            'M→E': 'Mission occurs in area',
            'E→B': 'Area contains structure',
            'B→E': 'Structure located in area',
            'E→C': 'Area contains character',
            'C→E': 'Character located in area',
            'E→I': 'Area contains item',
            'I→E': 'Item located in area',
            'G→G': 'Objective connects to objective',
            'G→M': 'Objective triggers mission',
            'M→G': 'Mission contains objective',
            'G→E': 'Objective located in area',
            'E→G': 'Area contains objective',
            'G→C': 'Objective involves character',
            'C→G': 'Character relates to objective',
            'G→I': 'Objective requires item',
            'I→G': 'Item triggers objective',
            'J→J': 'Path connects to path',
            'J→M': 'Path leads to mission',
            'M→J': 'Mission connects to path',
            'J→E': 'Path runs through area',
            'E→J': 'Area contains path',
            'J→B': 'Path connects to structure',
            'B→J': 'Structure connects to path',
            'J→C': 'Path leads to character',
            'C→J': 'Character located on path',
            'J→G': 'Path leads to objective',
            'G→J': 'Objective on path'
        };

        return descriptions[`${sourceType}→${targetType}`] || `${sourceDesc} connects to ${targetDesc}`;
    }

    function getColorForEntityType(type) {
        const colors = {
            'B': '#007bff',
            'M': '#28a745',
            'I': '#fd7e14',
            'F': '#6f42c1',
            'C': '#e83e8c',
            'D': '#17a2b8',
            'E': '#20c997',
            'G': '#ffc107',
            'J': '#dc3545'
        };

        return colors[type] || '#6c757d';
    }

    downloadBtn.addEventListener('click', () => {
        if (!jsonOutput.value) return;

        const jsonData = jsonOutput.value;
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.textContent ?
            fileName.textContent.replace(/\.\w+$/, '.json') :
            'map_data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    copyBtn.addEventListener('click', () => {
        if (!jsonOutput.value) return;

        jsonOutput.select();
        try {
            document.execCommand('copy');
            showStatus('Copied to clipboard!', true);
        } catch (err) {
            navigator.clipboard.writeText(jsonOutput.value)
                .then(() => showStatus('Copied to clipboard!', true))
                .catch(err => showStatus(`Error copying to clipboard: ${err.message}`, false));
        }
    });

    toggleVisualizeBtn.addEventListener('click', () => {
        visualizationContainer.classList.toggle('hidden');
        toggleVisualizeBtn.textContent =
            visualizationContainer.classList.contains('hidden') ?
                'Show Visualization' : 'Hide Visualization';
    });

    function showStatus(message, isSuccess) {
        statusMessage.textContent = message;
        statusMessage.className = 'status ' + (isSuccess ? 'success' : 'error');

        statusMessage.classList.remove('hidden');

        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 5000);
    }
});