<?php
/*
Plugin Name: SimWorks MSFS Ownership API (Lite)
Description: Minimal REST endpoint for the SimWorks Installer (no advanced headers) to avoid activation fatals.
Version: 0.4.1-lite
Author: Webhoot
*/

if (!defined('ABSPATH')) { exit; }

// Route constants
if (!defined('SWS_MSFS_ROUTE')) {
    define('SWS_MSFS_ROUTE', 'simworks/v1');
}
if (!defined('SWS_MSFS_ENDPOINT')) {
    define('SWS_MSFS_ENDPOINT', '/msfs-ownership');
}

// Very lightweight CORS for REST responses (optional, safe)
add_filter('rest_pre_serve_request', function($served, $result, $request, $server) {
    if (!headers_sent()) {
        @header('Access-Control-Allow-Origin: *');
        @header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
        @header('Access-Control-Allow-Methods: GET, OPTIONS');
    }
    return $served;
}, 10, 4);

add_action('rest_api_init', function () {
    // GET endpoint used by the installer
    register_rest_route(
        SWS_MSFS_ROUTE,
        SWS_MSFS_ENDPOINT,
        array(
            'methods'             => 'GET',
            'callback'            => 'sws_msfs_get_ownership_lite',
            // Always serve JSON. Auth is enforced in the callback (returns empty array when unauthenticated).
            // This avoids hosts/plugins that redirect to HTML login pages and break JSON clients.
            'permission_callback' => '__return_true',
        )
    );

    // OPTIONS preflight (for stricter environments)
    register_rest_route(
        SWS_MSFS_ROUTE,
        SWS_MSFS_ENDPOINT,
        array(
            'methods'             => 'OPTIONS',
            'callback'            => function() { return new WP_REST_Response(null, 200); },
            'permission_callback' => '__return_true',
        )
    );
});

// Add privacy/no-store headers and scoped CORS only for our endpoint to avoid CDN/proxy caching oddities
add_action('rest_post_dispatch', function($response, $server, $request) {
    $target = '/' . SWS_MSFS_ROUTE . SWS_MSFS_ENDPOINT;
    if ($request->get_route() !== $target) {
        return $response;
    }

    // Normalize to WP_REST_Response
    if (!($response instanceof WP_REST_Response)) {
        $response = rest_ensure_response($response);
    }

    // Minimal anti-cache and privacy headers (Lite version)
    $response->header('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
    $response->header('Pragma', 'no-cache');
    $response->header('Expires', '0');
    $response->header('Vary', 'Authorization, Cookie, Origin');

    // CORS reinforcement (safe)
    if (!headers_sent()) {
        @header('Access-Control-Allow-Origin: *');
        @header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
        @header('Access-Control-Allow-Methods: GET, OPTIONS');
    }

    return $response;
}, 10, 3);

function sws_msfs_get_ownership_lite( WP_REST_Request $request ) {
    $user_id = get_current_user_id();
    if (!$user_id) {
        return rest_ensure_response(array());
    }

    // Stable map of product IDs exposed to the installer
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

    // If WooCommerce is missing, return empty list (no fatal)
    if (!function_exists('wc_get_orders')) {
        return rest_ensure_response(array());
    }

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
    if (is_array($orders) || $orders instanceof Traversable) {
        foreach ($orders as $order) {
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
            $owned[] = array('id' => $pid, 'name' => $msfs_products[$pid]);
        }
    }

    return rest_ensure_response($owned);
}
