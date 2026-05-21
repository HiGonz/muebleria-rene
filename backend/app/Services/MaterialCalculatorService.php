<?php

namespace App\Services;

class MaterialCalculatorService
{
    public function calculate(array $payload): array
    {
        $type = $payload['type'];
        $width = $payload['width'] / 100;
        $height = $payload['height'] / 100;
        $depth = $payload['depth'] / 100;
        $shelves = (int) ($payload['shelves'] ?? 0);
        $drawers = (int) ($payload['drawers'] ?? 0);
        $doors = (int) ($payload['doors'] ?? 0);
        $material = $payload['material'] ?? 'Melamina blanca';

        $panelName = match ($material) {
            'MDF' => 'MDF 18mm',
            'Melamina blanca' => 'Melamina blanca 18mm',
            'Melamina nogal' => 'Melamina nogal 18mm',
            default => 'Triplay 12mm',
        };

        $costs = [
            'MDF 18mm' => 180,
            'Melamina blanca 18mm' => 210,
            'Melamina nogal 18mm' => 245,
            'Triplay 12mm' => 195,
            'Canto PVC 0.4mm' => 12,
            'Bisagra 35mm' => 35,
            'Corredera telescópica 450mm' => 95,
            'Tornillo confimát' => 2.5,
            'Jalador moderno' => 60,
            'Pata metálica' => 140,
        ];

        $items = [];
        $add = function (string $materialName, string $description, float $quantity, string $unit, float $unitCost) use (&$items): void {
            if ($quantity <= 0) {
                return;
            }

            $items[] = [
                'material' => $materialName,
                'description' => $description,
                'quantity' => round($quantity, 2),
                'unit' => $unit,
                'unitCost' => $unitCost,
                'subtotal' => round($quantity * $unitCost, 2),
            ];
        };

        if ($type === 'Closet') {
            $panelArea = ((2 * ($height * $depth)) + (2 * ($width * $depth)) + ($shelves * (max($width - 0.036, 0) * $depth)) + ($width * $height)) * 1.1;
            $canto = ((2 * ($depth + $height) * 2) + (2 * (max($width - 0.036, 0) + $depth) * $shelves)) * 1.15;

            $add($panelName, 'Paneles estructurales 18mm con 10% desperdicio', $panelArea, 'm²', $costs[$panelName]);
            $add('Canto PVC 0.4mm', 'Perímetro expuesto con 15% desperdicio', $canto, 'ml', $costs['Canto PVC 0.4mm']);
            $add('Bisagra 35mm', '2 bisagras por puerta', $doors * 2, 'pzas', $costs['Bisagra 35mm']);
            $add('Corredera telescópica 450mm', '1 par por cajón', $drawers, 'pares', $costs['Corredera telescópica 450mm']);
            $add('Tornillo confimát', 'Tornillería estimada', (4 + $shelves) * 8, 'pzas', $costs['Tornillo confimát']);
            $add('Jalador moderno', '1 jalador por frente visible', $doors + $drawers, 'pzas', $costs['Jalador moderno']);
        }

        if ($type === 'Escritorio') {
            $panelArea = (($width * $depth) + (4 * (($payload['height'] / 100) * 0.08)) + ($drawers > 0 ? 0.45 * $depth : 0) + ($shelves > 0 ? $width * 0.3 : 0)) * 1.1;

            $add($panelName, 'Cubierta y módulo auxiliar', $panelArea, 'm²', $costs[$panelName]);
            $add('Pata metálica', 'Juego de patas', 2, 'pares', $costs['Pata metálica']);
            $add('Corredera telescópica 450mm', '1 par por cajón', $drawers, 'pares', $costs['Corredera telescópica 450mm']);
            $add('Jalador moderno', 'Jaladores de cajón', $drawers, 'pzas', $costs['Jalador moderno']);
            $add('Tornillo confimát', 'Tornillería general', 32 + ($drawers * 8), 'pzas', $costs['Tornillo confimát']);
        }

        if ($type === 'Mueble TV') {
            $panelArea = ((2 * ($width * $depth)) + (2 * (($payload['height'] / 100) * $depth)) + ($shelves * (($width / max($shelves + 1, 1)) * $depth))) * 1.1;
            $add($panelName, 'Cuerpo y divisiones', $panelArea, 'm²', $costs[$panelName]);
            $add('Canto PVC 0.4mm', 'Frentes visibles con 15% desperdicio', (($width * 6) + ($depth * 4)) * 1.15, 'ml', $costs['Canto PVC 0.4mm']);
            $add('Bisagra 35mm', '2 bisagras por puerta', $doors * 2, 'pzas', $costs['Bisagra 35mm']);
            $add('Jalador moderno', 'Frentes y puertas', $doors + $drawers, 'pzas', $costs['Jalador moderno']);
            $add('Tornillo confimát', 'Tornillería general', 28 + ($shelves * 6), 'pzas', $costs['Tornillo confimát']);
        }

        return $items;
    }

    public function totals(array $items, float $laborPercentage = 30, float $profitPercentage = 20): array
    {
        $subtotal = round(array_reduce($items, fn (float $carry, array $item): float => $carry + $item['subtotal'], 0), 2);
        $laborCost = round($subtotal * ($laborPercentage / 100), 2);
        $profitCost = round($subtotal * ($profitPercentage / 100), 2);

        return [
            'subtotal_materials' => $subtotal,
            'labor_percentage' => $laborPercentage,
            'profit_percentage' => $profitPercentage,
            'labor_cost' => $laborCost,
            'profit_cost' => $profitCost,
            'total' => round($subtotal + $laborCost + $profitCost, 2),
        ];
    }
}
