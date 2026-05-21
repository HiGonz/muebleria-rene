<?php

namespace Tests\Unit;

use App\Services\MaterialCalculatorService;
use PHPUnit\Framework\TestCase;

class MaterialCalculatorServiceTest extends TestCase
{
    public function test_it_calculates_closet_items_and_totals(): void
    {
        $service = new MaterialCalculatorService();

        $items = $service->calculate([
            'type' => 'Closet',
            'width' => 180,
            'height' => 220,
            'depth' => 60,
            'shelves' => 3,
            'drawers' => 2,
            'doors' => 2,
            'material' => 'Melamina nogal',
        ]);

        $this->assertNotEmpty($items);
        $this->assertSame('Melamina nogal 18mm', $items[0]['material']);

        $totals = $service->totals($items);
        $this->assertGreaterThan(0, $totals['total']);
        $this->assertSame(30.0, $totals['labor_percentage']);
        $this->assertSame(20.0, $totals['profit_percentage']);
    }
}
