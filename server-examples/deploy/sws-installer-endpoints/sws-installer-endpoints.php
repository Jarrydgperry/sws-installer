<?php
/*
Plugin Name: SimWorks MSFS Ownership API
Description: REST API endpoint for owned MSFS aircraft and scenery (Installer) with Cloudflare-safe headers & conditional refresh.
Version: 0.4.2
Author: Webhoot
*/

defined('ABSPATH') || exit;

const SIMWORKS_MSFS_OWNERSHIP_VERSION      = '0.4.2';
const SIMWORKS_MSFS_OWNERSHIP_CACHE_TTL    = 300;   // Internal transient cache (seconds)
const SIMWORKS_MSFS_OWNERSHIP_FORCE_PARAM  = 'force';
const SIMWORKS_MSFS_OWNERSHIP_ROUTE        = 'simworks/v1';
const SIMWORKS_MSFS_OWNERSHIP_ENDPOINT     = '/msfs-ownership';

// Register endpoint
add_action('rest_api_init', function () {
	register_rest_route(
		SIMWORKS_MSFS_OWNERSHIP_ROUTE,
		SIMWORKS_MSFS_OWNERSHIP_ENDPOINT,
		array(
			'methods'             => 'GET',
			'callback'            => 'simworks_get_msfs_ownership',
			'permission_callback' => 'simworks_msfs_permission'
		)
	);
	// Explicit OPTIONS route to satisfy strict CORS preflight in some environments
	register_rest_route(
		SIMWORKS_MSFS_OWNERSHIP_ROUTE,
		SIMWORKS_MSFS_OWNERSHIP_ENDPOINT,
		array(
			'methods'             => 'OPTIONS',
			'callback'            => function() {
				$resp = new WP_REST_Response(null, 200);
				$resp->header('Access-Control-Allow-Origin', '*');
				$resp->header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
				$resp->header('Access-Control-Allow-Methods', 'GET, OPTIONS');
				return $resp;
			},
			'permission_callback' => '__return_true'
		)
	);
});

// Require authenticated user (JWT or cookie)
function simworks_msfs_permission() {
	return is_user_logged_in();
}

// Add anti-CDN/privacy headers, CORS, and 304 support only for our endpoint
add_action('rest_post_dispatch', function($response, $server, $request) {
	$target = '/' . SIMWORKS_MSFS_OWNERSHIP_ROUTE . SIMWORKS_MSFS_OWNERSHIP_ENDPOINT;
	if ($request->get_route() !== $target) {
		return $response;
	}

	// Normalize to WP_REST_Response
	if (!($response instanceof WP_REST_Response)) {
		$response = rest_ensure_response($response);
	}

	// Privacy + disable CDN cache
	$headers = $response->get_headers();
	$headers['Cache-Control']   = 'private, no-store, no-cache, must-revalidate, max-age=0';
	$headers['Pragma']          = 'no-cache';
	$headers['Expires']         = '0';
	$headers['Vary']            = 'Authorization, Cookie, Origin';
	$headers['CF-Cache-Status'] = 'DYNAMIC';

	// ETag / Last-Modified (client revalidation – CDN still won’t cache due to no-store)
	$data          = $response->get_data();
	$user_id       = get_current_user_id();
	$last_modified = gmdate('D, d M Y H:i:s') . ' GMT';

	$etag_payload = json_encode(array(
		'u' => $user_id,
		'c' => crc32(json_encode($data)),
		'v' => SIMWORKS_MSFS_OWNERSHIP_VERSION
	));
	$etag = '"' . substr(sha1($etag_payload), 0, 32) . '"';

	$headers['ETag']          = $etag;
	$headers['Last-Modified'] = $last_modified;

	// 304 if matches and not forced
	if (
		isset($_SERVER['HTTP_IF_NONE_MATCH']) &&
		trim((string) $_SERVER['HTTP_IF_NONE_MATCH']) === $etag &&
		empty($_GET[ SIMWORKS_MSFS_OWNERSHIP_FORCE_PARAM ])
	) {
		$response->set_status(304);
		$response->set_data(null);
	}

	// CORS (adjust origin whitelist if needed)
	if (!headers_sent()) {
		header('Access-Control-Allow-Origin: *');
		header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
		header('Access-Control-Allow-Methods: GET, OPTIONS');
	}

	foreach ($headers as $k => $v) {
		$response->header($k, $v);
	}

	return $response;
}, 10, 3);

// Ownership callback with transient cache (per user) and optional force refresh
function simworks_get_msfs_ownership(WP_REST_Request $request) {
	if (!function_exists('wc_get_orders')) {
		return rest_ensure_response(array());
	}

	$user_id = get_current_user_id();
	if (!$user_id) {
		return rest_ensure_response(array());
	}

	$force = (bool) $request->get_param(SIMWORKS_MSFS_OWNERSHIP_FORCE_PARAM);
	$cache_key = 'simworks_msfs_ownership_' . $user_id;

	if (!$force) {
		$cached = get_transient($cache_key);
		if ($cached !== false) {
			return rest_ensure_response($cached);
		}
	} else {
		delete_transient($cache_key);
	}

	// Stable map of product IDs you expose
	$msfs_products = array(
		33805 => 'Maia - Vilar de Luz airport for MSFS',
		33806 => 'Zenith CH701 STOL',
		33808 => 'Kodiak 100 Series II',
		33809 => "Van's RV-14",
		33810 => 'Kodiak 100 Series III Amphibian',
		33811 => "Van's RV-10",
		33812 => 'PC-12 Legacy',
		33813 => "Van's RV-8",
		52157 => 'GA-8 Airvan',
		52385 => 'GA-8 Airvan SystemsPulse',
		33807 => 'Okavango Delta for MSFS',
		53069 => 'GA-8 Airvan (MSFS 2024 Base)',
		54056 => 'GA-8 Airvan SystemsPulse (MSFS 2024)',
		54058 => 'Kodiak 100 Series III Amphibian (MSFS 2024)',
		54059 => 'Kodiak 100 Series II (MSFS 2024)',
	);

	$msfs_products = apply_filters('simworks_msfs_products', $msfs_products);
	if (empty($msfs_products)) {
		set_transient($cache_key, array(), SIMWORKS_MSFS_OWNERSHIP_CACHE_TTL);
		return rest_ensure_response(array());
	}

	// Use 'customer' arg for broader WooCommerce compatibility
	$orders = wc_get_orders(array(
		'customer'    => $user_id,
		'status'      => array('completed', 'processing', 'on-hold'),
		'limit'       => -1,
		'return'      => 'objects',
		'paginate'    => false,
		'orderby'     => 'date',
		'order'       => 'DESC',
	));

	$found_ids = array();
	if ($orders) {
		foreach ($orders as $order) {
			// Avoid hard class references to prevent fatals if WooCommerce not loaded
			if (!is_object($order) || !method_exists($order, 'get_items')) continue;
			foreach ($order->get_items() as $item) {
				if (!is_object($item) || !method_exists($item, 'get_product')) continue;
				$product = $item->get_product();
				if (!$product) continue;
				$pid = (int) (method_exists($product, 'get_id') ? $product->get_id() : 0);
				$parent_id = (int) (method_exists($product, 'get_parent_id') ? $product->get_parent_id() : 0);
				$final_id = $parent_id ? $parent_id : $pid;
				if (isset($msfs_products[$final_id])) {
					$found_ids[$final_id] = true;
				}
			}
		}
	}

	$owned = array();
	if ($found_ids) {
		ksort($found_ids, SORT_NUMERIC);
		foreach (array_keys($found_ids) as $pid) {
			$owned[] = array(
				'id'   => $pid,
				'name' => $msfs_products[$pid],
			);
		}
	}

	// Internal cache (not CDN-cacheable due to headers)
	set_transient($cache_key, $owned, SIMWORKS_MSFS_OWNERSHIP_CACHE_TTL);

	return rest_ensure_response($owned);
}

// Invalidate cache when order status changes
add_action('woocommerce_order_status_changed', function($order_id, $old_status, $new_status, $order) {
	// Avoid fatal if WooCommerce classes aren’t loaded
	if (!is_object($order) || !method_exists($order, 'get_user_id')) return;
	$user_id = $order->get_user_id();
	if ($user_id) {
		delete_transient('simworks_msfs_ownership_' . $user_id);
	}
}, 10, 4);

// Add user roles to JWT payload (unchanged)
add_filter('jwt_auth_token_before_dispatch', function($data, $user) {
	if ($user instanceof WP_User) {
		$data['roles'] = $user->roles;
	} else if (is_object($user) && isset($user->ID)) {
		$wp_user = new WP_User($user->ID);
		$data['roles'] = $wp_user->roles;
	}
	return $data;
}, 10, 2);
