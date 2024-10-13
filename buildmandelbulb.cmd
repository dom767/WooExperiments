mkdir Mandelbulb
cd Mandelbulb
del index.php
cd..
echo ^<?php /* Template Name: Mandelbulb Renderer */ ?^> > mandelbulb/index.php
type mandelbulb.html >> mandelbulb/index.php
mkdir Mandelbrot
cd Mandelbrot
del index.php
cd..
echo ^<?php /* Template Name: Mandelbrot Renderer */ ?^> > Mandelbrot/index.php
type Mandelbrot.html >> Mandelbrot/index.php
mkdir Bifurcation
cd Bifurcation
del index.php
cd..
echo ^<?php /* Template Name: Bifurcation Renderer */ ?^> > Bifurcation/index.php
type Bifurcation.html >> Bifurcation/index.php
pause