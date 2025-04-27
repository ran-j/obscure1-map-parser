# Obscure 1 Map Parser

A desktop application for parsing and analyzing map files from "Obscure 1".
 
## Download

You can download the latest release from the [Releases](https://github.com/ran-j/obscure1-map-parser/releases).

## Usage

1. Launch the application
2. Upload a .map file using the "Input Map File" section
3. Click "Convert to JSON" to parse the file
4. Explore the JSON output, analysis, and entity details in the tabs
5. Use the "Show Visualization" button to see a visual representation of the map

## File Format

The application works with binary .map files from Obscure 1, parsing various entity types:
* B - Block/Building entities (level geometry)
* C - Character/NPC entities (game characters)
* D - Dialog/Data entities (conversation trees)
* E - Environment/Area entities (map regions)
* F - Function/Feature entities (game logic)
* G - Gameplay/Goal entities (objectives, triggers)
* I - Item/Interaction entities (collectibles, pickups)
* J - Junction/Journey entities (pathways, transitions)
* M - Mission/Marker entities (objectives)