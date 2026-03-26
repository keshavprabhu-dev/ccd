import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'sum', standalone: true })
export class SumPipe implements PipeTransform {
  transform(items: any[], field: string): number {
    return (items || []).reduce((acc, item) => acc + (parseFloat(item[field]) || 0), 0);
  }
}

@Pipe({ name: 'sumField', standalone: true })
export class SumFieldPipe implements PipeTransform {
  transform(items: any[], field: string): number {
    return (items || []).reduce((acc, item) => acc + (parseFloat(item[field]) || 0), 0);
  }
}

@Pipe({ name: 'countImages', standalone: true })
export class CountImagesPipe implements PipeTransform {
  transform(checks: any[]): number {
    return (checks || []).reduce((acc, c) => acc + (c.images?.length || 0), 0);
  }
}
