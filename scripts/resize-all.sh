#! /bin/bash

SRC_FOLDER=../src/food-photos/raw/*
DEST_FOLDER=../src/img/food/
URL_PREFIX=/food-photos/
out_file=../images.yml

# Require the <size> argument(s)
if [[ $# -lt 1 ]]; then
    echo "Wrong number of arguments. Got $#, wanted at least 1."
    echo "Usage:"
    echo "    $0 <height> [<height> ...]"
    exit 1
fi


mkdir -p $DEST_FOLDER
# Make our output folders.
for height in "$@"; do
    mkdir -p ${DEST_FOLDER}/$height
done

# Clean out output file
echo "" > $out_file

for image in $SRC_FOLDER; do
    echo "Processing $image"
    entire_filename=$(basename "$image")
    file_extension="${entire_filename##*.}"
    file_filename="${entire_filename%.*}"

    # Produce string like 1920x1200
    oldsize=$(identify "$image" | cut -d " " -f 3)

    # Cut $oldsize up into width and height.
    width=$(echo $oldsize | cut -d "x" -f 1)
    height=$(echo $oldsize | cut -d "x" -f 2)
    aspect_ratio=$(echo "scale=4; $width / $height" | bc -l)
    date="${file_filename//./:}"

    # Write data to YAML file
    echo "- filename: ${entire_filename}" >> $out_file
    echo "  date: ${date}" >> $out_file
    echo "  aspectRatio: $aspect_ratio" >> $out_file

    for new_height in "$@"; do
        # Create the new filename
        new_filename="${DEST_FOLDER}${new_height}/${entire_filename}"

        if [[ ! -f $new_filename ]]; then
            # Resize image
            echo "Resizing to be ${new_height}px tall."
            convert "$image" -resize x${new_height} $new_filename
        else
            echo "File exists.  Skipping..."
        fi
    done
done
