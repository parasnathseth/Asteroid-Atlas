'''
Written by: Tori Ebanks
Date: October 4, 2025
NASA Space Apps Hackathon

Program to fetch astroid data from NASA Near Earth Object (NEO) database
This code was developed in part using AI.
'''
from __future__ import print_function, division
import numpy as np
from PyAstronomy import pyasl
import matplotlib.pylab as plt

import requests
import json
import pandas as pd

from astropy.coordinates import CartesianRepresentation, CartesianDifferential
from astropy import units as u
from poliastro.twobody import Orbit
from poliastro.bodies import Sun, Earth
# from poliastro.plotting import OrbitPlotter3D

# NEO API
apiKeyNEO = 'xOf7UzVnDZluGS8Ku5hTfqbUQuDy2b8O4PUPPKyX'
template = 'https://api.nasa.gov/neo/rest/v1/feed?start_date={}&end_date={}&api_key={}'

# Format: YYYY-MM-DD
startDate = ''
endDate = ''

startDate = '2025-01-01'
endDate = '2025-01-02'

# SBDB API
template_sbdb = 'https://ssd-api.jpl.nasa.gov/sbdb.api?sstr={}'
# print(template.format(startDate, endDate, apiKeyNEO))
# Call api and get data for dates
response = requests.get(template.format(startDate, endDate, apiKeyNEO))

#Convert data from binary to python string and decode json into dataframe
# convert = response.content.decode('ascii')
content = json.loads(response.content.decode('ascii'))
astroids = content['near_earth_objects']



# Collect all asteroid orbits and properties in dictionaries
asteroid_orbits = {}
asteroid_properties = {}
for date, ast_list in astroids.items():
	for asteroid in ast_list:
		print(f"Asteroid: {asteroid.get('name', 'unknown')}")
		sbdb_name = asteroid.get('name', '').replace(' ', '').replace('(', '').replace(')', '')[6:]
		sbdb_url = template_sbdb.format(sbdb_name)
		print(f"Fetching SBDB data: {sbdb_url}")
		sbdb_response = requests.get(sbdb_url)
		try:
			sbdb_json = sbdb_response.json()
			elements_list = sbdb_json.get('orbit', {}).get('elements', [])
			elements = {el['name']: el['value'] for el in elements_list if 'name' in el and 'value' in el}
			print(f"SBDB orbital element keys: {list(elements.keys())}")
			required_keys = ['a', 'e', 'i', 'om', 'w', 'ma']
			if not all(k in elements and elements[k] not in (None, '', 'null') for k in required_keys):
				print(f"Skipping asteroid {asteroid.get('name', 'unknown')} due to missing SBDB orbital elements.")
				continue
			a = float(elements['a']) * u.AU  # semi-major axis
			ecc = float(elements['e'])
			inc = float(elements['i']) * u.deg
			raan = float(elements['om']) * u.deg
			argp = float(elements['w']) * u.deg
			nu = float(elements['ma']) * u.deg  # mean anomaly as true anomaly approximation

			orb = Orbit.from_classical(Earth, a, ecc, inc, raan, argp, nu)
			print(f"Orbit created for asteroid: {asteroid['name']}")
			print(orb)

			num_points = 200
			true_anomalies = np.linspace(0, 2 * np.pi, num_points)
			coords = []
			a_val = a.to(u.km).value
			e_val = ecc
			i_val = inc.to(u.rad).value
			raan_val = raan.to(u.rad).value
			argp_val = argp.to(u.rad).value
			for ta in true_anomalies:
				r = a_val * (1 - e_val**2) / (1 + e_val * np.cos(ta))
				x_p = r * np.cos(ta)
				y_p = r * np.sin(ta)
				z_p = 0
				cos_O = np.cos(raan_val)
				sin_O = np.sin(raan_val)
				cos_w = np.cos(argp_val)
				sin_w = np.sin(argp_val)
				cos_i = np.cos(i_val)
				sin_i = np.sin(i_val)
				x = (cos_O*cos_w - sin_O*sin_w*cos_i)*x_p + (-cos_O*sin_w - sin_O*cos_w*cos_i)*y_p
				y = (sin_O*cos_w + cos_O*sin_w*cos_i)*x_p + (-sin_O*sin_w + cos_O*cos_w*cos_i)*y_p
				z = (sin_w*sin_i)*x_p + (cos_w*sin_i)*y_p
				coords.append([x, y, z])
			print("Asteroid orbit coordinates (km):")
			print(coords)
			# Use asteroid's name as identifier
			asteroid_orbits[asteroid.get('name', 'unknown')] = coords

			# Get size (diameter) and speed (velocity)
			# Size: try to get estimated_diameter from NEO API
			size = None
			if 'estimated_diameter' in asteroid and 'kilometers' in asteroid['estimated_diameter']:
				km_diam = asteroid['estimated_diameter']['kilometers']
				if 'estimated_diameter_max' in km_diam:
					size = km_diam['estimated_diameter_max']
			# Speed: try to get from close_approach_data (take first entry if available)
			speed = None
			if 'close_approach_data' in asteroid and len(asteroid['close_approach_data']) > 0:
				cad = asteroid['close_approach_data'][0]
				if 'relative_velocity' in cad and 'kilometers_per_second' in cad['relative_velocity']:
					speed = float(cad['relative_velocity']['kilometers_per_second'])
			asteroid_properties[asteroid.get('name', 'unknown')] = {
				'size_km': size,
				'speed_km_s': speed
			}
		except Exception as e:
			print(f"Could not create orbit for asteroid {asteroid.get('name', 'unknown')}: {e}")
# Save all asteroid orbits to a JSON file
with open("asteroid_orbit_coords.json", "w") as f:
	json.dump(asteroid_orbits, f)
# Save all asteroid properties to a JSON file
with open("asteroid_properties.json", "w") as f:
	json.dump(asteroid_properties, f)
