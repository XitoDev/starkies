import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Topbar } from './topbar';

describe('Topbar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('creates the business topbar with breadcrumb and date', () => {
    const fixture = TestBed.createComponent(Topbar);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.breadcrumb')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.today')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.logout-button')).toBeNull();
  });
});
