#!/bin/bash

#! /bin/bash

IMG_FOLDER=../src/food-photos/
RAW_FILES=${IMG_FOLDER}raw/*
URL_PREFIX=/food-photos/

# Require the <out_file> argument
if [[ $# -lt 1 ]]; then
    echo "Wrong number of arguments. Got $#, wanted at least 2."
    echo "Usage:"
    echo "    $0 <size> [<size> ...]"
    exit 1
fi

out_file=out.yml
echo "" > $out_file  # wipe it out

for image in $RAW_FILES; do
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
    echo "- raw: ${URL_PREFIX}raw/${entire_filename}" >> $out_file
    echo "  aspect_ratio: $aspect_ratio" >> $out_file

    for new_height in "$@"; do
        # Calculate new_width based on desired height
        new_width=$(expr $new_height \* $width / $height)

        # Create the new filename
        new_filename="${URL_PREFIX}${new_height}/${file_filename}-${new_width}x${new_height}.${file_extension}"
        echo "  h_$new_height: $new_filename" >> $out_file
    done
done
